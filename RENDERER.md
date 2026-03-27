# Build the First Real Renderer: Day Planner, Activity Timeline, and Coaching Surface

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The repository root contains `PLAN.md`; this document must be maintained in accordance with `PLAN.md`.

## Purpose / Big Picture

After this change, Digital Balance will no longer open to a placeholder status card. A user will be able to open the app and see a real single-day workspace with two synchronized lanes: planned work on the left and captured computer activity on the right. They will be able to create and edit planned blocks directly in the calendar, inspect what the app observed during any span of time, and get coaching when the captured activity appears to drift away from the current plan.

The first serious renderer is not a generic dashboard. It is a local-first, single-user day planner designed to answer one question quickly: “Am I doing what I planned to do right now?” The working proof is simple. Start the app with `npm run dev`, create a project and a planned block, watch the current day populate with captured activity, switch the activity aggregation window between 1, 5, 10, 15, 30, and 60 minutes, click a captured block to inspect the evidence, and confirm or redirect when the app believes the current work no longer matches the planned block.

## Progress

- [x] (2026-03-27 07:08Z) Read `PLAN.md` and captured the required ExecPlan format and living-document sections.
- [x] (2026-03-27 07:08Z) Inspected `ARCHITECTURE.md`, `src/preload/index.ts`, `src/shared/pipeline.ts`, and `src/renderer/src/App.tsx` to confirm the current renderer only shows pipeline status and that the preload surface does not yet expose calendar, projects, activity, or coaching APIs.
- [x] (2026-03-27 07:08Z) Inspected `package.json` and the current renderer entrypoints to confirm the frontend stack is React 19, Tailwind CSS 4, Electron Vite, and TypeScript, with no router, state library, or query library currently installed.
- [x] (2026-03-27 07:08Z) Inspected `src/main/db/migrations.ts` and `src/main/classification.ts` to confirm the app already stores minute summaries and classifier output, but does not yet store projects, planned schedule blocks, or task-specific classification context.
- [x] (2026-03-27 07:08Z) Converted the renderer direction from the product conversation into implementation defaults: day-focused calendar first, editable planned blocks, activity evidence drawer, mouse-first interactions, supportive coaching, and a light navigation shell for future sections.
- [ ] Add local-first planning persistence for projects and schedule blocks.
- [ ] Add renderer-facing read and write IPC contracts for calendar, projects, and coaching.
- [ ] Add main-process read models that turn minute-level ingest and classifications into aggregated activity slices for the day view.
- [ ] Replace the placeholder global classification goal with task-aware context derived from the active planned block.
- [ ] Build the calendar-first renderer with a two-lane day view, aggregation controls, evidence drawer, and project-backed planning forms.
- [ ] Add supportive off-task and AFK coaching prompts, including Electron system notifications and mirrored in-app state.
- [ ] Add a lightweight app shell with Calendar and Projects as real destinations and Stats and Feed as clearly labeled placeholders.
- [ ] Validate the end-to-end day-planning flow locally and update this plan with actual implementation evidence.

## Surprises & Discoveries

- Observation: the current renderer is intentionally almost empty.
  Evidence: `src/renderer/src/App.tsx` only subscribes to pipeline status and renders a syncing badge plus a placeholder card.

- Observation: the current preload bridge exposes only pipeline status.
  Evidence: `src/preload/index.ts` defines only `window.api.pipeline.getStatus()` and `window.api.pipeline.onStatus()`.

- Observation: the current persistence layer already contains enough minute-level source data to power the right-hand activity lane, but not enough planning data to power the left-hand lane.
  Evidence: `src/main/db/migrations.ts` defines `minute_ingest`, `minutes`, `classification_jobs`, and `classifications`, but no `projects` or schedule table.

- Observation: the current classifier compares activity against a placeholder app-wide goal rather than the user’s actual scheduled task.
  Evidence: `src/main/classification.ts` exports a single `ACTIVE_GOAL` constant and the request builder always uses that goal text.

- Observation: the backend refactor already created the right kind of main-process seams for a renderer expansion.
  Evidence: `src/main/index.ts` is now a composition root, `src/main/pipeline/service.ts` owns runtime orchestration, and `src/main/db/service.ts` is a thin DB facade with internal DB modules.

- Observation: the renderer stack is intentionally minimal and does not need a routing or global-state library for the first implementation.
  Evidence: `package.json` contains React, Tailwind, Electron Vite, and TypeScript, but no router, store, or data-fetching dependency.

## Decision Log

- Decision: the first serious renderer is a day-focused planner, not a broad dashboard.
  Rationale: the product conversation established that the app’s main job is to keep the user aligned with a planned schedule through a Memtime-style two-lane calendar.
  Date/Author: 2026-03-27 / Codex

- Decision: the left lane will use local-first schedule blocks stored in-app, with optional project attachment and task description, rather than beginning with Google Calendar or task-tool sync.
  Rationale: the user explicitly wants in-app planning first and external calendar sync later, and local-first storage keeps the first implementation self-contained.
  Date/Author: 2026-03-27 / Codex

- Decision: schedule blocks will store their own task data in this phase instead of referencing a reusable task table.
  Rationale: the product conversation favored direct schedule editing and block-owned task context. A reusable task model can be added later inside the Projects surface without blocking the first calendar implementation.
  Date/Author: 2026-03-27 / Codex

- Decision: the right lane will be built from minute-level ingest plus the latest classification and rendered as aggregated activity slices for 1, 5, 10, 15, 30, and 60 minute windows.
  Rationale: this matches the desired Memtime-like experience while preserving the current minute pipeline as the source of truth.
  Date/Author: 2026-03-27 / Codex

- Decision: AFK time will appear as explicit AFK blocks in the activity lane, while minutes with no captured window winner and no AFK state will appear as explicit low-emphasis data-gap slices rather than silently disappearing.
  Rationale: the user wants AFK to be inspectable. Showing data gaps separately keeps the timeline honest about what was captured and what was not.
  Date/Author: 2026-03-27 / Codex

- Decision: off-task coaching will use supportive language, Electron system notifications, and a mirrored in-app prompt state.
  Rationale: the user wants coaching even when the window is not frontmost, but also wants the renderer to remain the review surface for evidence and quick resolution.
  Date/Author: 2026-03-27 / Codex

- Decision: the first navigation shell will expose `Calendar` and `Projects` as real sections and `Stats` and `Feed` as clearly labeled placeholders.
  Rationale: the calendar is the primary feature, Projects is the next most important section, and the other sections should be visible as future structure without diluting the implementation effort.
  Date/Author: 2026-03-27 / Codex

- Decision: no new frontend libraries will be added for routing, remote query management, or global state in the first renderer implementation.
  Rationale: the app is an Electron desktop app with a small number of screens and a preload-based API surface. Local component state, small custom hooks, and the existing Electron IPC model are sufficient for the first pass.
  Date/Author: 2026-03-27 / Codex

## Things Still Ambiguous

The product direction is now strong enough to implement, but a few choices remain partially open. Each ambiguity below includes the default that this plan adopts so implementation can proceed without waiting for more conversation.

The first ambiguity is how far the Projects surface should go in the same implementation pass. The product direction clearly says Projects is the next important area after the calendar, but it does not require a full project-management system yet. The default for this plan is modest: Projects should support create, edit, archive, and color selection so the calendar can attach blocks to a project, but it should not yet introduce reusable subtasks, checklists, or complex project workflows.

The second ambiguity is the exact threshold and cooldown behavior for coaching prompts. The product direction is clear about the tone and the difference between off-task and AFK prompts, but not about timing. The default for implementation is as follows: create an off-task prompt only when there is an active schedule block, the last 3 classified activity minutes inside that block are all `on_task = false`, each classification has confidence of at least `0.75`, and the minutes are not AFK. Create an AFK prompt when the current block reaches the existing 3-minute AFK streak. After a prompt is shown, do not show another prompt for the same block and same prompt kind for 15 minutes unless the user resolves it or the app returns to on-task state for at least 5 continuous minutes.

The third ambiguity is how much freedom to allow with overlapping schedule blocks. The product direction emphasizes a clean day planner, not multi-track planning. The default is to disallow overlapping blocks within the same day and to treat a redirect as a split of the current block followed by the creation of a new non-overlapping block for the actual task.

The fourth ambiguity is whether the activity lane should show raw minute fragments or a cleaner merged timeline by default. The product direction clearly wants selectable aggregation windows, but not the exact merge rules beyond dominant activity and most-recent tie-breaking. The default is to align aggregation buckets to wall-clock time and merge adjacent buckets only when they have the same `kind`, `app`, `title`, `classification`, and linked planned block. This produces a readable timeline without hiding distinct transitions.

The fifth ambiguity is how much evidence to show in the drill-down drawer. The product direction wants explainability without clutter. The default is that the main calendar remains clean, and the drawer shows the planned block context, the dominant activity summary, the latest classification decision and reasoning, the raw per-minute slices in the selected range, and the raw window titles captured for those minutes. It does not yet show low-level AFK event JSON or internal pipeline version metadata.

The sixth ambiguity is whether Stats and Feed should be navigable on day one. The product direction says they exist, but they are not first-wave implementation goals. The default is to include them in the shell as disabled or “Coming soon” destinations with no fake analytics or placeholder social content.

## Outcomes & Retrospective

This planning pass produced a decision-complete renderer implementation plan rooted in the actual repository, rather than in assumptions. The repo still behaves exactly as before because no renderer code or backend code has been changed yet. What now exists is a self-contained specification that explains the product goal, the required backend contracts, the new persistence needed for planning, the calendar interactions, the coaching behavior, and the remaining ambiguities with explicit defaults.

The main lesson from the planning pass is that the renderer cannot be built as a pure frontend exercise. The right user experience depends on new main-process read models, schedule persistence, and task-aware classification context. The renderer work must therefore proceed as a coordinated backend-plus-frontend effort, even though the visible result is primarily UI.

## Context and Orientation

Digital Balance is a local-first Electron desktop application. “Local-first” means the app stores and operates on the user’s data on the local machine first, without requiring a hosted backend to function. The app’s current core already lives in the Electron main process. ActivityWatch provides raw activity collection. The app reads ActivityWatch window and AFK events, derives one normalized record per minute, stores both canonical minute ingest rows and read-optimized minute summaries in SQLite, and runs an asynchronous classifier that decides whether a minute looks on-task.

Right now the renderer is intentionally minimal. `src/renderer/src/App.tsx` renders a placeholder. `src/preload/index.ts` exposes only pipeline status to the renderer. `src/shared/pipeline.ts` is the only renderer-visible shared contract. The DB layer already stores minute ingest rows, minute summaries, classification jobs, and durable classifications, but it does not yet store user-created projects or planned blocks. The classifier currently compares every minute against a placeholder goal string in `src/main/classification.ts`, which is incompatible with the planned renderer because the renderer needs per-block task context.

The first renderer introduces a few domain terms that must stay stable throughout implementation. A “planned block” is a user-created span on the left lane of the calendar with a start time, end time, optional project, task title, task description, and optional coaching seed. An “activity slice” is a rendered block on the right lane built from one or more minute records or gaps. An “aggregation window” is the user-selected size of the buckets that produce those slices: 1, 5, 10, 15, 30, or 60 minutes. An “evidence drawer” is the inspectable side panel that explains why an activity slice looks the way it does. A “redirect” is the action the user takes when the app is correct that they are doing something other than the current planned block; it ends the current block at the drift point and creates a new block for the actual task. An “MVG” or minimum viable goal is the smallest concrete next step the app suggests when it detects drift.

The key files to understand before implementation are `src/main/index.ts`, `src/main/pipeline/service.ts`, `src/main/db/service.ts`, `src/main/db/migrations.ts`, `src/main/classification.ts`, `src/preload/index.ts`, `src/shared/pipeline.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/main.tsx`, and `src/renderer/src/assets/main.css`. New renderer and shared files created by this plan must fit into that structure without introducing a broad new framework.

## Milestones

### Milestone 1: Add planning persistence and renderer-facing shared contracts

At the end of this milestone, the repository will still show the placeholder renderer, but the backend will be able to store projects and planned schedule blocks, and the preload/shared contract layer will know what a day view, project, block, activity slice, evidence drawer payload, and coaching prompt look like. This milestone exists so the rest of the work is grounded in stable types and real local storage rather than ad hoc mock data.

Implementation in this milestone starts in `src/main/db/migrations.ts` by adding schema migrations for `projects` and `schedule_blocks`. `projects` must store `id`, `name`, `description`, `color`, `archived`, `created_at`, and `updated_at`. `schedule_blocks` must store `id`, `project_id`, `task_title`, `task_description`, `goal_seed`, `start_at`, `end_at`, `origin`, `created_at`, and `updated_at`. `origin` must be either `manual` or `redirect`. Overlaps must be rejected at the service layer before any write is committed.

This milestone also adds new shared contract files. `src/shared/calendar.ts` must define the day-view types, aggregation-window types, evidence types, and the IPC channel names for day reads and calendar mutations. `src/shared/projects.ts` must define the project and block-related write shapes that are reused by main, preload, and renderer. `src/shared/coaching.ts` must define the prompt shape and the coaching IPC channel names. `src/preload/index.ts` and `src/preload/index.d.ts` must be updated to expose `window.api.calendar`, `window.api.projects`, and `window.api.coaching` in addition to the existing pipeline API.

Run `npm run typecheck` after this milestone. Acceptance is that TypeScript succeeds and the new shared APIs are strongly typed from main through preload, even if the renderer has not started consuming them yet.

### Milestone 2: Add main-process day-view queries, project CRUD, block CRUD, and task-aware classification context

At the end of this milestone, the backend will be able to answer the questions the calendar UI needs: what projects exist, what blocks exist on a given day, what activity slices exist on that day at a chosen aggregation window, and what evidence belongs to a selected slice. This milestone also replaces the static placeholder classification goal with the current planned-block context so future off-task prompts are about the user’s actual plan rather than a hardcoded app-wide goal.

Implementation should extend the DB layer rather than bypass it. Add new DB modules under `src/main/db/` for planning writes and day-view reads. `src/main/db/planning.ts` must own project CRUD and block CRUD. `src/main/db/day-view.ts` must own queries that read `minute_ingest`, `minutes`, `classifications`, and `schedule_blocks` to produce `DayViewData` and `ActivityEvidence`. Keep `src/main/db/service.ts` as the thin facade and add the new methods there. The facade must remain the only public DB entrypoint used by the rest of the main process.

The day-view read model must use `minute_ingest` as the canonical basis for the activity timeline and then join in the latest matching classification row for each minute timestamp. The aggregation algorithm must partition the requested day into wall-clock buckets of the chosen size, derive the dominant minute-level activity within each bucket by total represented seconds, break ties by most recent minute timestamp, emit explicit AFK buckets when AFK dominates, and emit explicit gap buckets when there is no projected winner and no AFK activity. After bucketing, adjacent buckets with identical rendered identity may merge into a single slice for readability.

This milestone also changes `src/main/classification.ts` and the classification queue path so the request builder accepts goal context from the active planned block. Remove the hardcoded `ACTIVE_GOAL` constant. Replace it with a task-aware input containing `goalTitle`, `goalDescription`, `goalSeed`, and optional project name. The job payload stored in `classification_jobs.payload_json` must include that snapshot. The durable `classifications` row must continue storing `goal_title`, `goal_description`, and `goal_version`, but now `goal_version` must be a stable context hash derived from the block snapshot rather than the placeholder constant. Add a nullable `planned_block_id` column to `classifications` so the evidence drawer can show the intended source block when available while still remaining resilient to later block edits.

Add main-process IPC handlers in `src/main/index.ts` for the new shared channels, and keep the file thin by delegating actual logic to the DB facade and the new coaching service introduced in the next milestone. Run `npm run typecheck` and `npm run build`. Acceptance is that the backend compiles, the preload surface is complete, and an implementer can request real day data without needing the renderer to invent its own models.

### Milestone 3: Build the calendar-first renderer and light navigation shell

At the end of this milestone, the user will be able to open the app and see a real day planner. The app shell will contain a simple persistent navigation structure with Calendar as the default section, Projects as a working secondary section, and clearly labeled placeholders for Stats and Feed. The Calendar section will render a single-day vertical timeline with planned blocks on the left and activity slices on the right.

Create a renderer structure under `src/renderer/src/` that keeps the code readable without adding external state tools. `App.tsx` should become the shell and section switcher. Add `screens/calendar/CalendarScreen.tsx` and `screens/projects/ProjectsScreen.tsx`. Add supporting components for the time rail, planned block lane, activity lane, aggregation picker, block editor panel, evidence drawer, and pipeline status banner. Keep section state local to the app shell and screen-level hooks. Do not add a router package in this milestone.

The Calendar screen must support direct manipulation. Clicking and dragging in the planned lane creates a block. Dragging an existing block moves it. Dragging the top or bottom edge resizes it. Clicking a block opens an editor panel where the user can attach or change the project, task title, description, and goal seed. Keyboard support in this milestone is intentionally small: `N` creates a new block for the currently focused timespan or hour, `Escape` closes the active panel, and `Backspace` or `Delete` removes the selected block after confirmation.

The activity lane must support aggregation switching between 1, 5, 10, 15, 30, and 60 minutes without leaving the day view. Clicking an activity slice opens the evidence drawer. The drawer must show the time range, the dominant app and title, the linked planned block if any, the latest classification result, the reasoning sentence if present, the minute-by-minute breakdown in the selected range, and the actions `Confirm on task` and `Redirect`. `Confirm on task` records a prompt resolution and suppresses repeated prompting according to the coaching rules. `Redirect` opens a compact form that creates the actual-task block starting at the drift point and ending at either the current block end or the next non-overlapping boundary.

The visual design must feel deliberate and calendar-native rather than like a generic admin dashboard. Use Tailwind CSS 4 and CSS variables in `src/renderer/src/assets/main.css`. Prefer a warm schedule-board visual language with a visible time rail, clear vertical rhythm, and strong color coding for planned blocks, activity, AFK, and data gaps. Keep the UI desktop-first, with responsive collapse only for narrower Electron windows rather than mobile-first design.

Run `npm run typecheck`, `npm run build`, and `npm run dev`. Acceptance is behavioral: the calendar opens, projects can be created and attached to blocks, day navigation works, aggregation changes the right lane, and the evidence drawer opens on click.

### Milestone 4: Add coaching state and system notifications

At the end of this milestone, the app will not only visualize the day but actively coach the user back toward the plan. When there is an active schedule block and the recent classified activity strongly suggests drift, the app will show a supportive system notification and mirror the same coaching state in the renderer. AFK prompts will use different language aimed at getting the user unstuck rather than merely calling out drift.

Create `src/main/coaching/service.ts` as a focused service that owns active prompt state, prompt cooldowns, resolution handling, and Electron `Notification` delivery. Keep the service independent from renderer code. It should subscribe to minute-completion signals from the pipeline or be invoked by the pipeline once a minute is persisted and classified. It must query the DB facade for the active schedule block and recent classified minutes, apply the default threshold rules from the ambiguity section, and publish prompt-state updates over a shared coaching IPC channel.

The preload bridge must expose `getActivePrompt()`, `onPrompt(listener)`, `confirmPrompt(promptId)`, `dismissPrompt(promptId)`, and `redirectPrompt(promptId, input)`. The renderer must show an in-app prompt banner or drawer when a prompt is active so the user can resolve it even if system notifications are disabled or missed. The copy should be supportive and practical. For off-task prompts, the body should suggest the current minimum viable goal derived from the block’s title, description, and goal seed. For AFK prompts, the body should offer a gentle “stuck?” style nudge.

Run `npm run typecheck`, `npm run build`, and `npm run dev`, then manually trigger a scenario where an active block exists and the recent minutes are either off-task or AFK. Acceptance is that the system notification appears once per cooldown window, the renderer mirrors the prompt, and `Confirm on task` or `Redirect` changes the prompt state immediately.

## Plan of Work

Begin by expanding the shared contract layer. Add `src/shared/calendar.ts`, `src/shared/projects.ts`, and `src/shared/coaching.ts`. These files must be the source of truth for all renderer-visible shapes. Every new IPC channel string, every request shape, and every response type used by the renderer must live in `src/shared/`, not be duplicated between main and preload. The preload bridge must expose only typed functions and listeners that correspond exactly to those shared types.

Next, expand the SQLite schema. Add a migration for `projects` and a migration for `schedule_blocks`. Add a migration to `classifications` that introduces `planned_block_id` as a nullable column and any supporting index needed for evidence queries. Do not introduce a reusable `tasks` table in this phase. The schedule itself is the editable source of truth. All schedule writes must validate that `start_at < end_at`, that blocks remain within a single day, and that no overlap is created.

Then add DB facade methods and internal modules. The DB facade must expose project CRUD, block CRUD, day-view reads, evidence reads, and the small helper needed by coaching to resolve the active block and recent classified minutes. The day-view query must always accept a local date key and an aggregation window. It must return planned blocks and activity slices in a single payload so the renderer does not perform join logic. The evidence read must accept the selected slice’s time range and return a drawer payload that includes enough information to explain the slice without requiring raw SQL in the renderer.

After that, make classification task-aware. Replace the placeholder goal constant with request inputs supplied by the current planned block. Where the app currently creates classification jobs for eligible minutes, enrich the payload with planned-block context if a block covers that minute. When no block covers the minute, continue to classify the minute as before only if that still serves another part of the app; otherwise skip automatic on-task classification for unscheduled minutes. The default for this plan is to classify only minutes that belong to a planned block, because the renderer’s coaching logic is specifically about alignment with the plan.

Once the backend contracts exist, build the renderer shell and screens. `App.tsx` should own the navigation state and layout chrome. The Calendar screen should own the selected date, selected aggregation window, active block editor, active evidence drawer, and the data-fetch hooks that call the preload APIs. Keep state local and explicit. Use small custom hooks rather than a broad app store. The Projects screen should provide the small amount of project management needed to make scheduling useful: create, edit, color, archive.

Finally, add coaching. The coaching service belongs in the main process because system notifications must work when the renderer is not frontmost. The renderer’s role is to mirror, inspect, and resolve the current prompt state. The notification copy should be generated deterministically from the block context and the recent evidence so the first implementation is explainable and debuggable. Avoid free-form LLM-generated notification text in the first pass; use the model only for the on-task judgment, not for arbitrary prose generation.

## Concrete Steps

Work from the repository root: `/home/andrew/personal_projects/digital_balance`.

1. Establish the current baseline before any renderer work starts.

      npm run typecheck
      npm run build

   Expect both commands to succeed.

2. After adding the shared contracts and migrations, verify the repository still compiles.

      npm run typecheck

   Expect success. If TypeScript errors mention missing preload declaration updates, fix `src/preload/index.d.ts` before moving on.

3. After adding DB facade methods and IPC handlers, verify both type safety and build output.

      npm run typecheck
      npm run build

   Expect success. The main-process bundle should compile with the new channels and DB modules.

4. After implementing the calendar renderer shell, run the app locally.

      npm run dev

   Expect the Electron window to open to a day-view calendar instead of the placeholder card. You should be able to navigate days, switch aggregation windows, and create a block.

5. After adding coaching, run the app and manually exercise the full flow.

      npm run dev

   Create a project, create a planned block for the current time, allow activity to collect for several minutes, then produce an obvious off-task sequence. Expect a system notification and a mirrored in-app prompt.

6. Run final static validation over the changed areas.

      npm run typecheck
      npm run build
      ./node_modules/.bin/eslint src/main src/preload src/shared src/renderer

   Expect TypeScript and build to pass. If ESLint reports issues, fix them before considering the milestone complete.

## Validation and Acceptance

Acceptance is behavior-first. A user must be able to start the app and use it as a real day planner.

The first acceptance scenario is planning. Open the app, navigate to today, create a project named `Digital Balance`, and create a planned block from 09:00 to 10:30 titled `Renderer planning`. Refresh the app. The block must still exist in the same place and still be attached to the project.

The second acceptance scenario is timeline inspection. With ActivityWatch running and the minute pipeline healthy, leave the app open long enough to collect activity. Switch the activity aggregation between 1 minute and 15 minutes. The right lane must visibly re-bucket the day without losing total coverage. Clicking any activity slice must open the evidence drawer and show the corresponding app/title summary, classification, and minute-level evidence.

The third acceptance scenario is drift resolution. Create a block for the current time with a specific task, perform activity that clearly matches it for a few minutes, then switch to obviously unrelated activity. After the prompt threshold is met, the app must issue a supportive off-task prompt. Choosing `Confirm on task` must suppress the prompt. Choosing `Redirect` must split the current block at the drift point and create a new block for the actual task.

The fourth acceptance scenario is AFK coaching. During an active block, leave the machine AFK long enough to cross the existing AFK streak threshold. The activity lane must show explicit AFK time and the app must issue the AFK-specific coaching prompt rather than the off-task prompt.

The fifth acceptance scenario is shell behavior. Calendar and Projects must be usable sections. Stats and Feed must be visible as intentionally unavailable future sections rather than broken links or empty pages.

## Idempotence and Recovery

This plan is intentionally additive. The new schema work must be implemented as forward-only SQLite migrations so repeated app starts remain safe. Migration IDs must be unique and appended rather than renumbered. If a local test database becomes inconsistent during development, the safe recovery path is to move or delete the local app database under the Electron user-data directory and start the app again so the migrations replay from a clean state. Do not use destructive git commands as part of recovery.

Renderer work should be developed in small vertical slices. If the calendar UI becomes partially wired but the data contracts are not stable yet, prefer temporarily rendering empty states from the real API surface rather than inventing mock structures that will be deleted later. If coaching is not yet ready, the safe intermediate state is a renderer that can show day data and evidence without any prompt delivery. Do not ship a half-implemented notification loop that can spam the user.

## Artifacts and Notes

These facts were established during plan creation and should remain true unless the implementation deliberately changes them:

    `src/renderer/src/App.tsx` currently renders only a pipeline syncing badge and placeholder copy.

    `src/preload/index.ts` currently exposes only `window.api.pipeline`.

    `src/main/db/migrations.ts` currently has no planning tables.

    `src/main/classification.ts` currently classifies against a single placeholder goal constant.

The first renderer implementation should preserve the existing pipeline status banner rather than deleting it. The pipeline is still a meaningful operational state and should appear somewhere in the Calendar screen so the user can tell when recent history is still syncing.

When implementing the activity aggregation, prefer predictable wall-clock buckets over “sliding” buckets. This keeps the time rail easy to reason about and ensures the same minute belongs to the same bucket for everyone reading the code.

## Interfaces and Dependencies

Use the existing dependencies only: Electron, React 19, Tailwind CSS 4, TypeScript, `better-sqlite3`, and the current Electron preload pattern. Do not add React Router, Zustand, TanStack Query, or another app framework in this phase.

At the end of the implementation, the following shared interfaces must exist.

In `src/shared/calendar.ts`, define channel names and types for the day calendar. The exact names must be:

    export const CALENDAR_GET_DAY_CHANNEL = 'calendar:get-day'
    export const CALENDAR_GET_EVIDENCE_CHANNEL = 'calendar:get-evidence'
    export const CALENDAR_CREATE_BLOCK_CHANNEL = 'calendar:create-block'
    export const CALENDAR_UPDATE_BLOCK_CHANNEL = 'calendar:update-block'
    export const CALENDAR_DELETE_BLOCK_CHANNEL = 'calendar:delete-block'
    export const CALENDAR_REDIRECT_BLOCK_CHANNEL = 'calendar:redirect-block'
    export const CALENDAR_CONFIRM_ON_TASK_CHANNEL = 'calendar:confirm-on-task'

    export type AggregationWindowMinutes = 1 | 5 | 10 | 15 | 30 | 60

    export type PlannedBlock = {
      id: string
      projectId: string | null
      projectName: string | null
      projectColor: string | null
      taskTitle: string
      taskDescription: string | null
      goalSeed: string | null
      startAt: string
      endAt: string
      origin: 'manual' | 'redirect'
      createdAt: string
      updatedAt: string
    }

    export type ActivitySliceKind = 'activity' | 'afk' | 'gap'

    export type ActivitySlice = {
      id: string
      kind: ActivitySliceKind
      startAt: string
      endAt: string
      app: string | null
      title: string | null
      dominance: number | null
      needsReview: boolean
      plannedBlockId: string | null
      onTask: boolean | null
      confidence: number | null
    }

    export type DayViewData = {
      date: string
      aggregationMinutes: AggregationWindowMinutes
      plannedBlocks: PlannedBlock[]
      activitySlices: ActivitySlice[]
    }

    export type ActivityEvidenceMinute = {
      minuteTimestamp: string
      summaryStatus: string
      app: string | null
      title: string | null
      dominance: number | null
      afk: boolean
      onTask: boolean | null
      confidence: number | null
      reasoning: string | null
    }

    export type ActivityEvidence = {
      sliceId: string
      startAt: string
      endAt: string
      plannedBlock: PlannedBlock | null
      summary: {
        kind: ActivitySliceKind
        app: string | null
        title: string | null
        onTask: boolean | null
        confidence: number | null
        reasoning: string | null
      }
      minutes: ActivityEvidenceMinute[]
    }

    export type CalendarApi = {
      getDay(input: {
        date: string
        aggregationMinutes: AggregationWindowMinutes
      }): Promise<DayViewData>
      getEvidence(input: {
        startAt: string
        endAt: string
        aggregationMinutes: AggregationWindowMinutes
      }): Promise<ActivityEvidence>
      createBlock(input: {
        projectId: string | null
        taskTitle: string
        taskDescription: string | null
        goalSeed: string | null
        startAt: string
        endAt: string
      }): Promise<PlannedBlock>
      updateBlock(input: {
        id: string
        projectId: string | null
        taskTitle: string
        taskDescription: string | null
        goalSeed: string | null
        startAt: string
        endAt: string
      }): Promise<PlannedBlock>
      deleteBlock(input: { id: string }): Promise<void>
      redirectBlock(input: {
        sourceBlockId: string
        splitAt: string
        projectId: string | null
        taskTitle: string
        taskDescription: string | null
        goalSeed: string | null
      }): Promise<{
        preservedBlock: PlannedBlock
        redirectedBlock: PlannedBlock
      }>
      confirmOnTask(input: {
        startAt: string
        endAt: string
      }): Promise<void>
    }

In `src/shared/projects.ts`, define:

    export const PROJECTS_LIST_CHANNEL = 'projects:list'
    export const PROJECTS_CREATE_CHANNEL = 'projects:create'
    export const PROJECTS_UPDATE_CHANNEL = 'projects:update'
    export const PROJECTS_ARCHIVE_CHANNEL = 'projects:archive'

    export type ProjectRecord = {
      id: string
      name: string
      description: string | null
      color: string | null
      archived: boolean
      createdAt: string
      updatedAt: string
    }

    export type ProjectsApi = {
      list(): Promise<ProjectRecord[]>
      create(input: {
        name: string
        description: string | null
        color: string | null
      }): Promise<ProjectRecord>
      update(input: {
        id: string
        name: string
        description: string | null
        color: string | null
      }): Promise<ProjectRecord>
      archive(input: { id: string; archived: boolean }): Promise<void>
    }

In `src/shared/coaching.ts`, define:

    export const COACHING_GET_ACTIVE_CHANNEL = 'coaching:get-active'
    export const COACHING_STATUS_CHANNEL = 'coaching:status'
    export const COACHING_CONFIRM_CHANNEL = 'coaching:confirm'
    export const COACHING_DISMISS_CHANNEL = 'coaching:dismiss'
    export const COACHING_REDIRECT_CHANNEL = 'coaching:redirect'

    export type CoachingPromptKind = 'off_task' | 'afk'

    export type CoachingPrompt = {
      id: string
      kind: CoachingPromptKind
      plannedBlockId: string | null
      startAt: string
      endAt: string
      title: string
      body: string
      suggestedAction: string | null
      createdAt: string
    }

    export type CoachingApi = {
      getActive(): Promise<CoachingPrompt | null>
      onPrompt(listener: (prompt: CoachingPrompt | null) => void): () => void
      confirm(input: { promptId: string }): Promise<void>
      dismiss(input: { promptId: string }): Promise<void>
      redirect(input: {
        promptId: string
        projectId: string | null
        taskTitle: string
        taskDescription: string | null
        goalSeed: string | null
      }): Promise<void>
    }

In `src/main/db/service.ts`, extend `DatabaseService` with methods that exactly cover the shared APIs plus the coaching helper reads. Keep the facade thin and push query logic into new internal DB modules. In `src/main/classification.ts`, replace the static goal with a request input type that can accept:

    {
      goalTitle: string
      goalDescription: string | null
      goalSeed: string | null
      projectName: string | null
    }

In `src/main/coaching/service.ts`, define a focused service with this final shape:

    export type CoachingService = {
      start(): void
      stop(): void
      getActivePrompt(): CoachingPrompt | null
      confirmPrompt(promptId: string): void
      dismissPrompt(promptId: string): void
      redirectPrompt(input: {
        promptId: string
        projectId: string | null
        taskTitle: string
        taskDescription: string | null
        goalSeed: string | null
      }): Promise<void>
      handleMinuteUpdate(minuteTimestamp: string): Promise<void>
      onPromptChange(listener: (prompt: CoachingPrompt | null) => void): () => void
    }

This service must be instantiated from `src/main/index.ts` after the database and pipeline services are ready, and it must remain the only owner of prompt cooldowns and Electron notification delivery.

Revision note: this file was created on 2026-03-27 to capture the renderer direction from the product conversation and turn it into a self-contained ExecPlan. It includes explicit defaults for the remaining ambiguities so another engineer or agent can implement the renderer without relying on chat history.
