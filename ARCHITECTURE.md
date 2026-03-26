# Architecture

This document describes the current architecture of Digital Balance so future changes can be made against the actual system shape, not just assumptions.

## Overview

Digital Balance is a local-first Electron application that:

- starts and monitors local ActivityWatch services
- reads raw ActivityWatch window and AFK events
- derives one normalized record per minute
- stores both canonical minute input data and read-optimized projections in SQLite
- exposes pipeline status to the renderer through a small preload API

The current design is intentionally main-process centric: the renderer is for presentation, while data collection, reconciliation, persistence, and background work live in the Electron main process.

## Runtime Boundaries

### Main Process

`src/main/index.ts` is the system core. It currently owns:

- Electron app startup
- bundled ActivityWatch process management
- ActivityWatch connectivity checks and bucket discovery
- minute scheduler and reconciliation loop
- minute derivation logic
- SQLite initialization and migrations
- projection rebuilding support
- classification queue production, consumption, retry scheduling, and pruning
- pipeline status state and IPC emission

This file is doing a lot by design right now. It is the primary place to look for behavior, but it is also the most likely refactor target as the product grows.

`src/main/classification.ts` now holds the focused OpenAI helper logic for:

- repo-root `.env` API key loading
- prompt constants and placeholder goal metadata
- chat completion request construction
- model-response parsing and validation
- retry delay calculation

Soon:
- activitywatch/ for server/watcher startup and bucket/event fetching
- pipeline/ for reconciliation, minute derivation, and status
- db/ for migrations, persistence, rebuilds, and queue handling

### Preload

`src/preload/index.ts` is the bridge between main and renderer. Its job is to expose a small, typed, safe API rather than letting the renderer talk directly to Node, SQLite, or ActivityWatch internals.

Current custom preload surface:

- `window.api.pipeline.getStatus()`
- `window.api.pipeline.onStatus(listener)`

### Shared Contract

`src/shared/pipeline.ts` contains the shared IPC contract for pipeline status:

- channel names
- `PipelineStatus`
- `PipelineApi`

This prevents the main process, preload, and renderer from drifting apart on status shape.

### Renderer

`src/renderer/src/App.tsx` is intentionally thin. It does not compute minute records or query the database directly. It subscribes to pipeline status and renders a small syncing banner while reconciliation is active.

## External Dependency: ActivityWatch

Digital Balance does not do raw activity tracking itself. It depends on ActivityWatch for collection.

Current ActivityWatch components:

- `aw-server`
- `aw-watcher-window`
- `aw-watcher-afk`

The app:

- starts bundled ActivityWatch binaries if needed
- reuses already-running ActivityWatch processes when possible
- discovers bucket IDs dynamically from `/api/0/buckets`
- reads events from the detected window and AFK buckets

No bucket IDs are hardcoded.

ActivityWatch has its own separate SQLite database for raw watcher data. That database is not the same as the app database.

## Startup Sequence

At a high level, startup works like this:

1. Electron becomes ready.
2. The app initializes the local SQLite database and runs migrations.
3. The app starts or reuses ActivityWatch services.
4. The browser window is created without waiting for historical reconciliation.
5. Bucket discovery begins.
6. Once both watcher buckets are found, background reconciliation starts and the minute scheduler is armed.

Important design choice:

- startup reconciliation is best-effort and asynchronous
- the app favors time-to-interactive over blocking boot on catch-up work

This means the UI should stay responsive even if historical reconciliation takes time.

## Minute Processing Model

The app processes time in wall-clock minute buckets.

### Scheduling

- the scheduler aligns to wall-clock minute boundaries
- each scheduled tick processes the previous minute
- on each tick, the app reconciles the last 5 minutes rather than trusting only the latest minute

This reconciliation window exists to tolerate late-arriving ActivityWatch data, short service hiccups, and timing drift.

### Inputs

For each minute, the app fetches:

- window events from the ActivityWatch window bucket
- AFK events from the ActivityWatch AFK bucket

### Winner Selection

The current winner logic is:

- sum `event.duration` per unique app
- choose the app with the highest total duration
- break ties using the most recent event timestamp
- use the most recent title seen for the winning app
- compute `dominance` as `winner_duration / 60`, clamped to `0..1`

The app uses real ActivityWatch event durations, not a fixed polling increment.

### AFK Logic

Current AFK behavior:

- AFK is a signal, not a hard gate
- per-minute AFK duration is derived from AFK events whose status is `"afk"`
- a minute is treated as AFK-active if AFK duration exceeds 50 seconds
- AFK becomes `true` on the summary record only after 3 consecutive AFK-active minutes
- app, title, and dominance are still preserved when AFK is true if window data exists

### Empty And Skipped Minutes

- If a minute has zero window events, the app writes a true null minute:
  - `app = null`
  - `title = null`
  - `dominance = null`
  - `afk = true`
- If window events exist but no winner can be derived, the app skips the `minutes` projection row for that minute rather than writing a null summary

## Persistence Model

The SQLite database lives at:

- `path.join(app.getPath('userData'), 'digital_balance.db')`

On Linux this is typically:

- `~/.config/digital_balance/digital_balance.db`

SQLite WAL mode is enabled.

### `minute_ingest`

`minute_ingest` is the canonical per-minute source of truth.

It stores:

- minute identity
- timezone snapshot
- source bucket IDs
- raw window and AFK event JSON
- derived AFK duration and AFK streak
- winning app/title metadata
- dominance
- review flags
- version metadata

Important nuance:

- `minute_ingest` is canonical
- `minute_ingest` is not append-only yet
- it is currently one updatable row per minute, so reconciliation can revise a minute in place

### `minutes`

`minutes` is a derived, read-optimized materialized summary.

It stores the simplified per-minute record the rest of the product can read cheaply:

- timestamp
- app
- title
- dominance
- afk
- review and provenance metadata

Key identity rule:

- `timestamp` is the business identity of a minute
- `id` is only a surrogate database key

Skipped `id` values are normal and are not a sign of lost minute data.

### `classification_jobs`

`classification_jobs` is the operational work queue for automatic LLM classification.

Current state:

- jobs are created only for eligible summary minutes
- a single main-process consumer drains the queue asynchronously
- queue rows are operational and are deleted on success or invalidation
- transient failures are retried with backoff
- queue growth is capped at 10,000 pending rows
- oldest pending jobs are pruned when the cap is exceeded

The queue is not the durable history. It exists only to manage work that still needs to be attempted.

### `classifications`

`classifications` stores durable classifier output.

Each row captures:

- the linked minute row
- the minute timestamp
- `on_task`
- `confidence`
- `reasoning`
- version metadata for model, prompt, classifier, and goal
- whether the row was manually corrected

Important behavior:

- automatic classifications are append-only across version changes
- the current version tuple is used to prevent duplicate automatic classifications
- projection rebuilds relink stored classifications back to current `minutes.id` values using `minute_timestamp`

## Rebuild Strategy

The architecture intentionally separates canonical ingest from projection.

Current intent:

- `minute_ingest` is the canonical minute store
- `minutes` is rebuildable
- `classification_jobs` payloads can also be regenerated from canonical data
- existing `classifications` rows can be preserved while minute projections are rebuilt and relinked

There is an internal rebuild function in the main process that recomputes projections from `minute_ingest` without querying ActivityWatch again.

This is important because it allows future logic changes to:

- dominance calculation
- AFK thresholds
- `needs_review` heuristics
- classification payloads
- classifier prompt/model versions

without treating historical projections as unrecoverable truth.

## Pipeline Status And UI Visibility

The app tracks pipeline status in the main process and exposes it to the renderer over IPC.

Current pipeline phases:

- `idle`
- `reconciling`
- `error`

Current triggers:

- `startup`
- `scheduled`
- `manual`

The renderer uses this only for lightweight visibility, currently a small “Syncing past activity...” banner. This keeps reconciliation visible without turning the UI into the control plane for the data pipeline.

## Review And Confidence Model

The app keeps raw minute values even when confidence is low.

Instead of discarding uncertain data, it computes `needs_review` for downstream handling.

Current review triggers include:

- app is `"unknown"`
- title is `"unknown"`
- app is empty
- dominance is below `0.2`

This allows future UI and classification systems to treat low-confidence minutes differently without losing the raw evidence.

## Intentional Architectural Choices

These choices were made on purpose:

- **Local-first storage:** minute data is persisted locally in SQLite.
- **Main-process pipeline:** collection, reconciliation, and persistence stay out of the renderer.
- **Best-effort reconciliation:** boot stays fast; catch-up runs in the background.
- **Canonical ingest + projection split:** minute input data and display/query data are not the same thing.
- **Minimal IPC surface:** renderer gets status, not unrestricted database access.
- **Dynamic ActivityWatch discovery:** bucket IDs are discovered at runtime rather than baked into code.
- **Async queue consumer:** classification runs outside the minute ingestion path and never blocks startup or reconciliation.
- **Versioned classifier output:** automatic classifications are stored with model/prompt/goal versions instead of overwriting prior outputs.

## Known Limits And Future Refactor Targets

This architecture is working, but there are known boundaries:

- `src/main/index.ts` currently owns too many responsibilities
- `minute_ingest` is canonical but not immutable
- classification currently depends on a repo-root `.env` file and a single hardcoded placeholder goal
- rebuild is internal and not yet surfaced as a formal maintenance action
- pipeline status is UI-visible, but pipeline control is not yet user-facing

Likely future refactors:

- split main-process concerns into dedicated modules
- move the classification worker behind a more explicit service boundary
- decide whether `minute_ingest` should remain row-per-minute or evolve into a revision/history model
- add operational diagnostics for DB path, DB initialization success, and persistence health

## Practical Reference

When debugging, use this mental model:

- ActivityWatch raw tracking problem: check ActivityWatch server and watcher logs
- Minute derivation problem: check main-process reconciliation and winner/AFK logic
- Missing summary row problem: check `minute_ingest` first, then `minutes`
- UI visibility problem: check `PipelineStatus` flow through main, preload, and renderer
- Classification backlog problem: check `classification_jobs` size and pruning
- Missing or stale classification problem: check `classification_jobs` first, then `classifications`

If future behavior changes, update this document alongside the code so the architecture stays explicit.
