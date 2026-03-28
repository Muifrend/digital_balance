# Architecture

This document describes the current architecture of Digital Balance so future changes can be made against the actual system shape, not just assumptions.

## Overview

Digital Balance is a local-first Electron application that:

- starts and monitors local ActivityWatch services
- reads raw ActivityWatch window and AFK events
- derives one normalized record per minute
- stores both canonical minute input data and read-optimized projections in SQLite
- stores local planning data for projects and scheduled work blocks
- exposes typed pipeline, calendar, project, and coaching APIs to the renderer through preload

The current design is intentionally main-process centric: the renderer is for presentation, while data collection, reconciliation, persistence, and background work live in the Electron main process.

## Runtime Boundaries

### Main Process

`src/main/index.ts` is now the composition root for the Electron main process. It owns:

- Electron app startup
- Browser window creation
- IPC registration for pipeline, calendar, projects, and coaching
- service construction and startup order
- renderer event broadcasting for pipeline status, calendar invalidation, and coaching prompts
- shutdown cleanup

The operational behavior now lives in focused modules:

- `src/main/activitywatch/service.ts` owns bundled ActivityWatch process management, health checks, bucket discovery, and event fetching
- `src/main/pipeline/service.ts` owns pipeline status state, minute scheduling, reconciliation, and recovery flow
- `src/main/pipeline/minute.ts` owns pure minute-derivation logic and related helper types
- `src/main/db/service.ts` is the DB composition root that wires together the DB internals and exposes the stable `DatabaseService` API
- `src/main/coaching/service.ts` owns active prompt state, cooldowns, system notifications, and prompt-resolution behavior

The DB internals are now split further:

- `src/main/db/context.ts` holds shared mutable DB runtime state and typed prepared-statement shapes
- `src/main/db/migrations.ts` owns schema creation and migration helpers
- `src/main/db/statements.ts` owns prepared-statement creation
- `src/main/db/persistence.ts` owns minute persistence and previous-AFK-streak lookups
- `src/main/db/projection-rebuild.ts` owns projection rebuild logic from canonical ingest rows
- `src/main/db/classification-queue.ts` owns automatic classification queue building, retry scheduling, and worker execution
- `src/main/db/planning.ts` owns project CRUD, schedule-block CRUD, block redirect/split behavior, and manual on-task confirmation writes
- `src/main/db/day-view.ts` owns day-view aggregation, evidence reads, and the coaching snapshot query model
- `src/main/db/utils.ts` owns shared DB-layer mapping and timestamp helpers

`src/main/classification.ts` holds the focused OpenAI helper logic for:

- repo-root `.env` API key loading
- prompt constants
- chat completion request construction
- model-response parsing and validation
- retry delay calculation

The classification helper no longer contains a single app-wide placeholder goal. Instead, the classification queue passes per-minute planned-task context into the request builder.

### Preload

`src/preload/index.ts` is the bridge between main and renderer. Its job is to expose a small, typed, safe API rather than letting the renderer talk directly to Node, SQLite, or ActivityWatch internals.

Current custom preload surface:

- `window.api.pipeline.getStatus()`
- `window.api.pipeline.onStatus(listener)`
- `window.api.calendar.getDay(...)`
- `window.api.calendar.getEvidence(...)`
- `window.api.calendar.createBlock(...)`
- `window.api.calendar.updateBlock(...)`
- `window.api.calendar.deleteBlock(...)`
- `window.api.calendar.redirectBlock(...)`
- `window.api.calendar.confirmOnTask(...)`
- `window.api.calendar.onChanged(listener)`
- `window.api.projects.list()`
- `window.api.projects.create(...)`
- `window.api.projects.update(...)`
- `window.api.projects.archive(...)`
- `window.api.coaching.getActive()`
- `window.api.coaching.onPrompt(listener)`
- `window.api.coaching.confirm(...)`
- `window.api.coaching.dismiss(...)`
- `window.api.coaching.redirect(...)`

### Shared Contract

The renderer-visible IPC contracts now live in focused shared modules:

- `src/shared/pipeline.ts` for pipeline status
- `src/shared/calendar.ts` for day-view, evidence, schedule-block, and calendar-change contracts
- `src/shared/projects.ts` for project CRUD contracts
- `src/shared/coaching.ts` for prompt state and prompt resolution contracts

This prevents the main process, preload, and renderer from drifting apart on payload shape.

### Renderer

`src/renderer/src/App.tsx` is still intentionally thin today. It does not compute minute records or query the database directly. The renderer implementation has not caught up to the new backend surface yet, but it now has typed preload contracts for planning, day-view reads, evidence, and coaching in addition to pipeline status.

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
5. The coaching service is created and subscribes to DB change signals.
6. Bucket discovery begins.
7. Once both watcher buckets are found, background reconciliation starts and the minute scheduler is armed.

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

- If a minute has zero window events, the app still writes an `empty_window` canonical ingest row in `minute_ingest`, but it skips the `minutes` projection row.
- If window events exist but no winner can be derived, the app also skips the `minutes` projection row rather than writing a null summary.

## Persistence Model

The SQLite database lives at:

- `path.join(app.getPath('userData'), 'digital_balance.db')`

On Linux this is typically:

- `~/.config/digital_balance/digital_balance.db`

SQLite WAL mode is enabled.

The DB layer is intentionally split into a thin public facade plus internal helpers:

- `src/main/db/service.ts` keeps the stable interface consumed by the rest of the app
- migrations, statement setup, persistence, planning writes, day-view reads, rebuilds, and classification queue behavior live in dedicated internal modules under `src/main/db/`

This keeps the rest of the main process insulated from SQLite implementation detail while still avoiding a broader public service split.

### `projects`

`projects` stores the user’s local planning containers.

Each row captures:

- project identity
- name
- description
- color
- archived state
- timestamps

This table is local-first. It exists so schedule blocks and future project views have a stable project reference without requiring cloud sync.

### `schedule_blocks`

`schedule_blocks` stores the planned schedule shown in the left lane of the day view.

Each row captures:

- optional linked project
- task title
- task description
- goal seed for coaching
- start and end timestamps
- origin (`manual` or `redirect`)
- timestamps

Important behavior:

- blocks are treated as the editable source of truth for the planned day
- overlaps are rejected by the backend service layer
- redirecting work splits the current block and creates a new block for the actual task

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

- jobs are created only for eligible summary minutes that fall inside a planned schedule block
- a single main-process consumer drains the queue asynchronously
- queue rows are operational and are deleted on success or invalidation
- transient failures are retried with backoff
- queue growth is capped at 10,000 pending rows
- oldest pending jobs are pruned when the cap is exceeded

The queue is not the durable history. It exists only to manage work that still needs to be attempted.

Implementation note:

- queue persistence and worker execution are owned by `src/main/db/classification-queue.ts`
- the rest of the app still interacts with that behavior only through `DatabaseService`

Each queued job snapshots the planned context used for the classification:

- linked planned block ID
- goal title
- goal description
- goal seed
- project name

This keeps classifier behavior stable even if the schedule is edited later.

### `classifications`

`classifications` stores durable classifier output.

Each row captures:

- the linked minute row
- the minute timestamp
- the linked planned block when one existed
- `on_task`
- `confidence`
- `reasoning`
- version metadata for model, prompt, classifier, and goal
- whether the row was manually corrected

Important behavior:

- automatic classifications are append-only across version changes
- the current version tuple is used to prevent duplicate automatic classifications
- manual “confirmed on task” actions are stored as corrected classification rows rather than in a separate prompt-resolution table
- projection rebuilds relink stored classifications back to current `minutes.id` values using `minute_timestamp`
- day-view reads prefer the latest corrected classification over automatic output for the same minute when present

### Day View Read Model

The renderer does not query minute tables directly. The backend now builds a day-view read model for the calendar surface.

Current day-view behavior:

- day reads start from `minute_ingest` as the canonical source
- the backend joins the latest relevant classification for each minute
- the backend maps the current planned block onto each minute where a block covers that time
- the backend aggregates minute slots into wall-clock buckets of `1`, `5`, `10`, `15`, `30`, or `60` minutes
- the backend emits three slice kinds: `activity`, `afk`, and `gap`
- the backend also provides a separate evidence payload for drill-down on any selected slice

This keeps the renderer focused on presentation rather than on rebuilding domain logic from raw rows.

## Rebuild Strategy

The architecture intentionally separates canonical ingest from projection.

Current intent:

- `minute_ingest` is the canonical minute store
- `minutes` is rebuildable
- `classification_jobs` payloads can also be regenerated from canonical data
- existing `classifications` rows can be preserved while minute projections are rebuilt and relinked

There is an internal rebuild function in the main process that recomputes projections from `minute_ingest` without querying ActivityWatch again.

Implementation note:

- the rebuild logic lives in `src/main/db/projection-rebuild.ts`
- it reuses the persistence path rather than maintaining a second write implementation

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

The renderer currently uses this only for lightweight visibility, a small “Syncing past activity...” banner. This keeps reconciliation visible without turning the UI into the control plane for the data pipeline.

## Calendar And Coaching Events

The backend now emits lightweight renderer-facing events in addition to pipeline status.

Current event types:

- `calendar:changed`, keyed by local date, when schedule blocks change, minute persistence updates a day, or asynchronous classification results change that day’s read model
- `coaching:status`, carrying the current prompt or `null`, whenever the coaching service changes prompt state

These events exist so the renderer can stay in sync with asynchronous backend work without polling.

## Coaching Model

The backend now contains a dedicated coaching runtime in the main process.

Current coaching behavior:

- the coaching service queries the active planned block and recent classified minutes from the DB facade
- it produces either `off_task` or `afk` prompts
- it enforces cooldowns per planned block and prompt kind
- it shows Electron system notifications when supported
- it mirrors active prompt state to the renderer over IPC
- prompt resolution can confirm on-task behavior, dismiss the prompt, or redirect into a new schedule block

The coaching service reacts to DB-driven calendar changes rather than polling the renderer.

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
- **Local-first planning:** projects and scheduled work blocks are also persisted locally in SQLite.
- **Main-process pipeline:** collection, reconciliation, and persistence stay out of the renderer.
- **Best-effort reconciliation:** boot stays fast; catch-up runs in the background.
- **Canonical ingest + projection split:** minute input data and display/query data are not the same thing.
- **Typed IPC surface:** renderer gets specific pipeline, calendar, project, and coaching APIs rather than unrestricted database access.
- **Dynamic ActivityWatch discovery:** bucket IDs are discovered at runtime rather than baked into code.
- **Async queue consumer:** classification runs outside the minute ingestion path and never blocks startup or reconciliation.
- **Planned-context classification:** on-task classification is evaluated against the currently scheduled work rather than a single app-wide goal.
- **Versioned classifier output:** automatic classifications are stored with model/prompt/goal versions instead of overwriting prior outputs.
- **Main-process coaching:** prompt generation and notification delivery stay in the main process so coaching can work even when the renderer is not frontmost.

## Known Limits And Future Refactor Targets

This architecture is working, but there are known boundaries:

- `minute_ingest` is canonical but not immutable
- classification still depends on a repo-root `.env` file
- rebuild is internal and not yet surfaced as a formal maintenance action
- the renderer contracts now exist for planning and coaching, but the renderer implementation is still behind the backend surface
- coaching thresholds and copy are currently simple heuristics rather than a richer adaptive model

Likely future refactors:

- move the classification worker behind a more explicit service boundary
- decide whether `minute_ingest` should remain row-per-minute or evolve into a revision/history model
- add operational diagnostics for DB path, DB initialization success, and persistence health
- decide whether planning should remain block-owned or evolve into reusable task entities
- decide whether calendar invalidation should stay event-only or gain a more explicit query/cache layer

## Practical Reference

When debugging, use this mental model:

- ActivityWatch raw tracking problem: check ActivityWatch server and watcher logs
- Minute derivation problem: check main-process reconciliation and winner/AFK logic
- Missing summary row problem: check `minute_ingest` first, then `minutes`
- UI visibility problem: check `PipelineStatus` flow through main, preload, and renderer
- Classification backlog problem: check `classification_jobs` size and pruning
- Missing or stale classification problem: check `classification_jobs` first, then `classifications`
- Missing planned work problem: check `projects`, then `schedule_blocks`
- Day-view mismatch problem: check `minute_ingest`, `classifications`, and the aggregation logic in `src/main/db/day-view.ts`
- Prompt not appearing problem: check the active block in `schedule_blocks`, recent classifications, and the coaching cooldown logic in `src/main/coaching/service.ts`

If future behavior changes, update this document alongside the code so the architecture stays explicit.
