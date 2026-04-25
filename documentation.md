# Canopy Documentation

Canopy is a local-first desktop app that pairs a calendar-style planner with passively captured computer activity, then uses AI to tell you whether what you're doing matches what you planned to do.

## Purpose

### Why this exists

Most productivity tools either help you **plan** (calendars, task lists) or help you **measure** (time trackers, RescueTime), but not both — and almost none reconcile the two. People can finish a day with a full calendar and no honest sense of whether they actually worked on what they meant to.

### The problem it solves

- **The intention–execution gap:** users plan a focused work block, then drift into Slack, email, or unrelated browsing without realizing it.
- **Manual time tracking is unreliable:** asking users to self-report defeats the purpose; they forget, lie to themselves, or stop using the tool.
- **Privacy concerns with cloud trackers:** sending detailed window/title telemetry to a third-party server is a non-starter for many users.

Canopy solves these by passively capturing activity through [ActivityWatch](https://activitywatch.net/) (which runs locally), storing everything in a local SQLite database, and using OpenAI only for short, structured classification calls — never bulk activity exfiltration.

### Target users / stakeholders

- **Knowledge workers and students** who plan their day in time blocks and want honest feedback on follow-through.
- **People with ADHD or focus challenges** who benefit from gentle, in-the-moment nudges when they drift.
- **Privacy-conscious users** who reject SaaS time trackers but accept a local-first app.
- **Internal stakeholders:** the product is in private beta (macOS DMG distribution); the immediate audience is beta testers giving feedback on planner usability and coaching quality.

### Scope (concise)

Today: single-day planner, minute-by-minute activity capture, optional AI classification of "on-task vs off-task," coaching prompts when drift is detected.
Not yet: cross-day project rollups, external calendar sync, mobile, multi-user.

## User Flow

### Entry: first launch

1. User installs Canopy (DMG on macOS, or runs from source).
2. On launch, Canopy:
   - initializes its local SQLite database under Electron's user data directory,
   - checks whether ActivityWatch is already running on `http://localhost:5600`; if not, starts the bundled `aw-server`, `aw-watcher-window`, and `aw-watcher-afk` processes,
   - opens the calendar view.
3. On macOS, if Accessibility permission is missing, ActivityWatch can still see the active app but not the window title — the user is expected to grant permission and relaunch.
4. (Optional) User adds an `OPENAI_API_KEY` in Settings to enable classification and coaching. Without it, the planner still works; AI features stay dormant.

### Daily loop

1. **Plan the day.** User opens the Calendar screen and creates **planned blocks** in the left lane (e.g. "9–11 AM: Write spec for ingest pipeline"). Each block can be linked to a project.
2. **Work normally.** No tracker UI to interact with; ActivityWatch passively records window focus and AFK state in the background.
3. **See activity fill in.** The right lane updates roughly once a minute with **activity slices** showing which app/title dominated each window of time. Slices are color-coded.
4. **Inspect evidence.** User clicks any slice to open an **evidence drawer** showing the raw minutes that fed into it: app, window title, dominance score, AFK status, classification confidence.
5. **Get coached.** If recent minutes inside an active planned block are classified off-task (or AFK) past a threshold, Canopy shows a brief, supportive coaching prompt ("Take the next small step on [block title]"). Cooldown logic prevents prompt fatigue.
6. **Review.** At end of day or week, user opens Analytics for an on-task percentage, top apps, and per-project breakdown.

### Key decision points for the user

- **Whether to enable the OpenAI key** — controls whether classification and coaching run at all.
- **Granting macOS Accessibility permission** — controls whether window titles (and therefore meaningful classification) are available.
- **Whether to link blocks to projects** — linked blocks get richer classification context; unlinked blocks are still tracked.

### Outcomes

- A timeline of what was planned vs. what actually happened, side by side.
- An on-task percentage backed by inspectable per-minute evidence.
- Optional in-the-moment nudges when drifting.

## Technical Implementation

### Architecture overview

Canopy is an Electron + React + TypeScript app with three processes:

- **Main process** ([src/main/](src/main/)) — Node.js. Owns ActivityWatch lifecycle, SQLite, the minute-reconciliation pipeline, OpenAI classification, and coaching.
- **Renderer process** ([src/renderer/](src/renderer/)) — React 19 + Tailwind CSS v4. UI only; no direct filesystem or network access.
- **Preload bridge** ([src/preload/index.ts](src/preload/index.ts)) — exposes a typed `window.api` to the renderer via `contextBridge`, mapping to `ipcRenderer.invoke`/`on`.

Build tooling: **electron-vite** (Vite for renderer, esbuild for main/preload). Config in [electron.vite.config.ts](electron.vite.config.ts).

Shared TypeScript types and IPC channel constants live in [src/shared/](src/shared/) so both sides agree on the contract (e.g. `CALENDAR_GET_DAY_CHANNEL`, `CoachingPrompt`).

### Components and data flow

```
ActivityWatch (local HTTP :5600)
        │
        ▼
┌─────────────────────────┐
│  Main process pipeline  │
│                         │
│  activitywatch/service  │── spawns aw-server, aw-watcher-window, aw-watcher-afk
│  pipeline/service       │── polls events every ~minute
│  pipeline/minute.ts     │── derives MinutePersistencePayload (winning app, dominance, AFK, review flags)
│  db/persistence         │── upserts into SQLite
│  db/classification-queue│── enqueues eligible minutes
│  classification.ts      │── calls OpenAI (gpt-4o-mini)
│  coaching/service       │── watches off-task / AFK streaks, emits prompts
└──────────┬──────────────┘
           │ IPC (invoke + send)
           ▼
   Renderer (React)
   CalendarScreen ── PlannedLane / ActivityLane / EvidenceDrawer
   AnalyticsScreen
   ProjectsScreen / SettingsScreen
```

### Data layer (SQLite via better-sqlite3)

Schema in [src/main/db/migrations.ts](src/main/db/migrations.ts). Core tables:

- `minutes` — one row per minute timestamp; winning app, title, dominance, AFK, needs-review flag, plus version columns (`pipeline_version`, `afk_logic_version`, `review_flag_version`, `classifier_version`, `prompt_version`) so the system can rebuild derived data when logic changes.
- `minute_ingest` — raw ingestion staging, separated so reconciliation is idempotent.
- `schedule_blocks` — user-planned blocks (start, end, title, optional `project_id`).
- `projects` — project metadata.
- `classification_jobs` — pending OpenAI requests.
- `classifications` — `{minute_ts, on_task, confidence, reasoning}` results.
- `schema_migrations` — applied migration tracking.

Database file location: Electron user data directory (e.g. `~/.config/digital_balance/digital_balance.db` on Linux). The internal identifier is still `digital_balance`; the product name is `Canopy`.

Heavy queries use prepared statements ([src/main/db/statements.ts](src/main/db/statements.ts)). Multi-table writes wrap in transactions inside [src/main/db/persistence.ts](src/main/db/persistence.ts).

### ActivityWatch integration

[src/main/activitywatch/service.ts](src/main/activitywatch/service.ts) handles:

- **Reuse-or-spawn:** healthchecks `http://localhost:5600` and reuses an existing server, otherwise spawns the bundled binaries from `resources/activitywatch/<platform>/`.
- **Bucket discovery:** dynamically resolves the `aw-watcher-window` and `aw-watcher-afk` bucket IDs (which include hostnames, so they aren't hard-coded).
- **Event fetching:** pulls window and AFK events for a time range via the AW HTTP API.

The macOS production build downloads a pinned upstream ActivityWatch release at build time (see [scripts/prepare-activitywatch-macos.mjs](scripts/prepare-activitywatch-macos.mjs)) and stages it inside the DMG.

### Minute reconciliation pipeline

[src/main/pipeline/minute.ts](src/main/pipeline/minute.ts) implements the pure derivation logic: given raw window + AFK events for a minute, compute the dominant app/title, dominance ratio, AFK status, and review flags (low dominance, unknown app, etc.). Keeping this pure makes it testable and replayable.

[src/main/pipeline/service.ts](src/main/pipeline/service.ts) is the orchestrator: polls AW on a timer, derives payloads, persists, queues classification jobs for minutes that are inside a planned block and not flagged for review, and broadcasts pipeline status (`idle` / `reconciling` / `error`) to the renderer.

### Classification (OpenAI)

[src/main/classification.ts](src/main/classification.ts) builds a structured prompt — current planned block, project context, observed app/title — and asks the model for `{on_task, confidence, reasoning}` as JSON. Model: `gpt-4o-mini` (chosen for cost/latency). The prompt version is recorded with each result so prompt changes don't silently corrupt history.

If `OPENAI_API_KEY` is missing or blank, the queue worker no-ops; the rest of the app stays functional.

### Coaching

[src/main/coaching/service.ts](src/main/coaching/service.ts) subscribes to minute updates and watches each active planned block for sustained off-task or AFK streaks. When a threshold is crossed and the per-block cooldown has elapsed, it composes a short prompt and broadcasts it to the renderer (`CoachingPrompt`) plus optionally a system notification.

### Renderer

[src/renderer/src/App.tsx](src/renderer/src/App.tsx) holds top-level section state (calendar / projects / analytics / settings / friends placeholder) and subscribes to pipeline status and coaching prompts via the preload API.

Key calendar components in [src/renderer/src/calendar/](src/renderer/src/calendar/):

- `TimeGrid` — hourly background grid.
- `PlannedLane` / `BlockEditor` — user-authored planned blocks.
- `ActivityLane` / `ActivitySlice` — aggregated activity, color-coded by classification.
- `EvidenceDrawer` — drill-down into the raw minutes behind a slice.

Data fetching uses small custom hooks ([useCalendarData.ts](src/renderer/src/calendar/useCalendarData.ts), [useProjects.ts](src/renderer/src/projects/useProjects.ts)) that call the preload API and re-fetch on `onChanged` events broadcast from main. There is no Redux/Zustand layer — local component state plus IPC subscriptions are sufficient at current scope.

### IPC contract

The preload exposes namespaced async APIs to the renderer: `window.api.calendar`, `window.api.pipeline`, `window.api.coaching`, `window.api.projects`, `window.api.analytics`, `window.api.settings`. Request/response uses `ipcRenderer.invoke` + `ipcMain.handle`; push updates (status, prompts, calendar changes) use `webContents.send` + `ipcRenderer.on`. Channel names are constants in [src/shared/](src/shared/) so both processes import the same string.

### Notable patterns and assumptions

- **Local-first.** All persistent state is in SQLite under Electron user data; the only outbound network call is to OpenAI when classification is enabled.
- **Versioned derived data.** Every minute row records the versions of the logic that produced it so the pipeline can detect stale rows and recompute.
- **Pure derivation, side-effectful orchestration.** `pipeline/minute.ts` is pure; `pipeline/service.ts` does I/O. This split is the main reason the pipeline is testable.
- **Graceful degradation.** Missing OpenAI key → no classification, planner still works. Missing macOS Accessibility permission → app/title degraded, planner still works. Missing bundled ActivityWatch binaries → reuses an existing local AW server if present.
- **Assumption (stated):** the docs in this repo (README, this file) are the source of truth for setup; the `digital_balance` identifier visible in the database path is legacy and will not break anything for users.

### Build and distribution

- `npm run dev` — electron-vite dev server with HMR for the renderer.
- `npm run build:mac` — runs the macOS prep script to fetch and stage the pinned ActivityWatch release, then builds an unsigned, non-notarized DMG via electron-builder. Default arch is `x64` to match the bundled ActivityWatch.
- CI: [.github/workflows/release-macos-dmg.yml](.github/workflows/release-macos-dmg.yml) builds and publishes the private-beta DMG on tag pushes; `ACTIVITYWATCH_VERSION` can be overridden via repo variable or `workflow_dispatch` input.
