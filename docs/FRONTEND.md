# Frontend Architecture

Digital Balance's renderer is a React 19 + TypeScript single-page app running inside Electron. It communicates with the main process exclusively through a typed IPC bridge (`window.api`). There is no client-side router — the entire UI is a single calendar screen.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | React 19 (JSX, hooks) |
| Build | Vite via `electron-vite` |
| Language | TypeScript (strict) |
| Styles | Inline style objects + CSS custom properties (no Tailwind at runtime) |
| Fonts | DM Sans (UI) + DM Serif Display (headings) via Google Fonts CDN |

---

## File Layout

```
src/
├── shared/                     # Types shared between main and renderer
│   ├── calendar.ts             # PlannedBlock, ActivitySlice, DayViewData, …
│   ├── coaching.ts             # CoachingPrompt
│   └── projects.ts             # ProjectRecord
│
├── preload/
│   ├── index.ts                # Builds window.api via contextBridge
│   └── index.d.ts              # TypeScript declarations for window.api
│
└── renderer/src/
    ├── main.tsx                # React root, mounts <App />
    ├── assets/main.css         # Design tokens + global resets
    ├── App.tsx                 # Pipeline status subscription → <CalendarScreen>
    └── screens/calendar/       # All calendar UI (see below)
```

---

## IPC Bridge (`window.api`)

The preload script exposes four namespaces through Electron's `contextBridge`. Components never import from `electron` directly.

```
window.api
├── pipeline
│   ├── getStatus() → PipelineStatus
│   └── onStatus(fn) → unsubscribe
├── calendar
│   ├── getDay({ date, aggregationMinutes }) → DayViewData
│   ├── getEvidence({ startAt, endAt, aggregationMinutes }) → ActivityEvidence
│   ├── createBlock(input) → PlannedBlock
│   ├── updateBlock(input) → PlannedBlock
│   ├── deleteBlock({ id }) → void
│   ├── redirectBlock(input) → void
│   ├── confirmOnTask({ startAt, endAt }) → void
│   └── onChanged(fn) → unsubscribe
├── projects
│   ├── list() → ProjectRecord[]
│   ├── create / update / archive
│   └── (no subscription — refetch manually)
└── coaching
    ├── getActive() → CoachingPrompt | null
    ├── onPrompt(fn) → unsubscribe
    ├── confirm / dismiss / redirect
```

Subscriptions always return an unsubscribe function, used as the `useEffect` cleanup return value.

---

## Design System

All design tokens live in `src/renderer/src/assets/main.css` as CSS custom properties.

### Colour palette

| Group | Variables | Used for |
|---|---|---|
| Background | `--bg`, `--bg2`, `--bg3`, `--surface`, `--surface2` | Page, panels, cards |
| Olive | `--olive-50` … `--olive-700` | Planned blocks, primary actions, on-task |
| Sage | `--sage-100`, `--sage-300`, `--sage-500` | AFK, rest |
| Amber | `--amber-100`, `--amber-300`, `--amber-400` | Off-task, uncertain |
| Terracotta | `--terra-100`, `--terra-300`, `--terra-500` | Needs review, current-time line, errors |
| Text | `--text-primary/secondary/tertiary` | |
| Border | `--border`, `--border2` | |

### Radius tokens

`--r-sm` 6px · `--r-md` 10px · `--r-lg` 16px · `--r-xl` 22px

### Colour semantics for blocks and slices

| Element | Background | Left border |
|---|---|---|
| Planned block (no project) | `--olive-100` | `--olive-500` |
| Planned block (project colour) | `{hex}22` (8 % alpha) | `{hex}` |
| Activity — on task | `--olive-50` | `--olive-400` |
| Activity — off task | `--amber-100` | `--amber-400` |
| Activity — needs review | `--terra-100` | `--terra-300` |
| AFK slice | `--sage-100` | `--sage-300` |
| Current time line | `--terra-300`, 1.5 px | — |
| Drag ghost | `--olive-100` at 70 % opacity | dashed `--olive-400` |

---

## Calendar Screen: Component Tree

```
App
└── CalendarScreen               ← all state lives here
    ├── CoachingBanner?          ← shown when activePrompt != null
    ├── header
    │   ├── DateNavigator
    │   └── AggregationPicker
    ├── lane-labels row
    └── main content
        ├── TimeGrid             ← scrollable container, time math hub
        │   ├── TimeRail         ← 52 px hour labels (left)
        │   ├── CurrentTimeLine  ← real-time terracotta bar
        │   ├── PlannedLane      ← left 50 % (minus rail)
        │   │   ├── HourGridLines
        │   │   ├── PlannedBlock × N
        │   │   └── drag ghost
        │   └── ActivityLane     ← right 50 %
        │       ├── HourGridLines
        │       └── ActivitySlice × N
        └── side panel (one of):
            ├── BlockEditor      ← create / edit / redirect
            └── EvidenceDrawer   ← minute-by-minute breakdown
```

---

## State Management

All state is local React state hoisted to `CalendarScreen`. There is no global store.

```ts
// Navigation
const [date, setDate] = useState(todayIso())          // "YYYY-MM-DD"
const [aggregationMinutes, setAggregationMinutes] = useState<AggregationWindowMinutes>(15)

// Data
const { data: dayData, refetch } = useCalendarData(date, aggregationMinutes)
const { projects } = useProjects()

// UI
const [panel, setPanel] = useState<ActivePanel>({ kind: 'none' })
const [activePrompt, setActivePrompt] = useState<CoachingPrompt | null>(null)
const scrollRef = useRef<HTMLDivElement>(null)   // passed to TimeGrid + drag handlers
```

### Panel state machine

`panel` is a discriminated union — the active side panel with all the context it needs:

```ts
type ActivePanel =
  | { kind: 'none' }
  | { kind: 'create';   startAt: string; endAt: string }
  | { kind: 'edit';     block: PlannedBlock }
  | { kind: 'redirect'; sourceBlockId: string; splitAt: string }
  | { kind: 'evidence'; slice: ActivitySlice }
```

---

## Time Grid Mathematics

`TimeGrid.tsx` is the single source of truth for all pixel ↔ time conversions.

### Zoom model (Memtime-style)

Row height is constant at **28 px**. The aggregation window determines how many minutes each row represents, which controls total grid height and visible time range.

```
pxPerHour(agg) = 28 × (60 / agg)
```

| Aggregation | px/hour | ~Hours visible at 700 px |
|---|---|---|
| 1 min | 1 680 | ~0.5 h |
| 5 min | 336 | ~2.5 h |
| 15 min | 112 | ~7 h |
| 30 min | 56 | ~14 h |
| 60 min | 28 | full day |

### Exported functions

```ts
pxPerHour(agg)                          // pixels per hour
minuteToY(minute, agg)                  // minute-of-day → px offset from grid top
yToMinute(y, agg)                       // px offset → minute-of-day
snapToQuarter(minute)                   // round to nearest 15-min boundary
clamp(value, min, max)
isoToMinuteOfDay(iso)                   // "…T14:30:00Z" → 870
minuteOfDayToIso(localDate, minute)     // ("2026-03-27", 870) → ISO string
formatMinute(minute)                    // 870 → "14:30"
formatTimeFromIso(iso)                  // convenience: formatMinute(isoToMinuteOfDay(iso))
formatTimeRange(startAt, endAt)         // "14:30 – 15:15"
useTimeCoords(agg, scrollRef)           // hook → { clientYToMinute, deltaYToMinutes }
```

### `useTimeCoords` — coordinate conversion hook

Converts browser viewport coordinates to grid minutes, accounting for the scroll offset of the TimeGrid container:

```ts
clientYToMinute(clientY):
  y = clientY - container.getBoundingClientRect().top + container.scrollTop
  return yToMinute(y, agg)

deltaYToMinutes(deltaY):
  return yToMinute(deltaY, agg)   // delta needs no scroll correction
```

Used by `PlannedLane` (drag-to-create) and `PlannedBlock` (move / resize).

---

## Drag Interactions

### Drag-to-create (PlannedLane)

1. `pointerdown` on lane background → capture pointer, record `startMin`
2. `pointermove` → update `endMin`, enforce minimum 15 min, render ghost block
3. `pointerup` with ≥ 15 min span → call `onCreateDraft(startAt, endAt)`
4. CalendarScreen opens `{ kind: 'create' }` panel with pre-filled times

### Move / resize (PlannedBlock)

Three drag zones on each block:

| Zone | Height | Cursor | Effect |
|---|---|---|---|
| Top handle | 8 px | `ns-resize` | Adjust `startAt` |
| Body | rest | `grab` | Move entire block |
| Bottom handle | 8 px | `ns-resize` | Adjust `endAt` |

Optimistic UI: `localTop` / `localHeight` state updated on every `pointermove` for instant feedback. On `pointerup`, calls `window.api.calendar.updateBlock(…)`. Movement < 4 px is treated as a click (opens edit panel).

---

## Data Fetching Hooks

### `useCalendarData(date, aggregationMinutes)`

- Fetches `DayViewData` via `window.api.calendar.getDay()`
- Re-fetches whenever `date` or `aggregationMinutes` changes
- Subscribes to `window.api.calendar.onChanged(changedDate)` — refetches only if the changed date matches the currently viewed date (tracked via `dateRef`)
- Returns `{ data, loading, error, refetch }`

### `useProjects()`

- Fetches all `ProjectRecord[]` via `window.api.projects.list()` on mount
- Returns `{ projects, loading, error, refetch }`
- No live subscription — caller must call `refetch()` after mutations

---

## Shared Primitives

These small files are imported across multiple calendar components:

| File | What it provides |
|---|---|
| `HourGridLines.tsx` | 24 absolute-positioned 1 px dividers (both lanes use this) |
| `SidePanel.tsx` | Outer shell for BlockEditor + EvidenceDrawer (width, bg, flex column) |
| `CloseButton.tsx` | The × dismiss button used in both panels |
| `useEscapeKey.ts` | `document` keydown listener that calls `onClose` on Escape |

---

## Key Data Types

```ts
// shared/calendar.ts
type AggregationWindowMinutes = 1 | 5 | 10 | 15 | 30 | 60

type PlannedBlock = {
  id, projectId, projectName, projectColor,
  taskTitle, taskDescription, goalSeed,
  startAt, endAt,                          // ISO strings
  origin: 'manual' | 'redirect'
}

type ActivitySlice = {
  id, kind: 'activity' | 'afk' | 'gap',
  startAt, endAt,
  app, title,
  onTask: boolean | null,
  needsReview: boolean,
  plannedBlockId: string | null
}

type DayViewData = {
  date, aggregationMinutes,
  plannedBlocks: PlannedBlock[],
  activitySlices: ActivitySlice[]
}

// shared/projects.ts
type ProjectRecord = { id, name, color, archived, … }

// shared/coaching.ts
type CoachingPrompt = {
  id, kind: 'off_task' | 'afk',
  plannedBlockId, startAt, title, body
}
```

---

## Rendering a Block / Slice (positioning recipe)

Both `PlannedBlock` and `ActivitySlice` follow the same pattern:

```ts
const startMin  = isoToMinuteOfDay(item.startAt)
const durationMin = (new Date(item.endAt) - new Date(item.startAt)) / 60000
const top       = minuteToY(startMin, aggregationMinutes)
const height    = Math.max(minuteToY(durationMin, aggregationMinutes), MIN_HEIGHT)
// → position: absolute; top; height
```

Using ISO timestamp arithmetic (not minute subtraction) correctly handles blocks that end at midnight (endAt = 00:00 of next day).

---

## Extending the Renderer

**Add a new screen:** Create a folder under `src/renderer/src/screens/`, add an entry in `App.tsx`.

**Add a new IPC call:** Define the channel constant and types in `src/shared/`, implement the handler in `src/main/`, expose it via `contextBridge` in `src/preload/index.ts`, and add the type declaration to `src/preload/index.d.ts`.

**Add a new block interaction:** Build on `useTimeCoords` for coordinate math. Follow the optimistic-UI pattern in `PlannedBlock` — keep local position state during drag, call the API on pointer-up.
