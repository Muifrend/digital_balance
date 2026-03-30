# Canopy

Canopy is a local-first desktop app for planning your day against what your computer actually did. It pairs a calendar-style planning lane with an ActivityWatch-backed activity lane, stores data locally in SQLite, and can use OpenAI to classify whether recent activity matched the block you intended to work on.

## What Canopy Does Today

- Shows a single-day planner with planned blocks on the left and captured activity on the right
- Reads ActivityWatch window and AFK events, then rolls them up into minute-based activity slices
- Lets you inspect evidence for any slice, including app, title, confidence, and minute-level detail
- Stores planning data, minute ingest, projections, and classifications locally
- Surfaces coaching prompts when recent activity appears to drift away from the active plan

## Requirements

- Node.js and npm
- A local ActivityWatch bundle placed under `resources/activitywatch/<platform>`
- An optional repo-root `.env` file with `OPENAI_API_KEY` if you want automatic on-task classification and coaching

## Install

```bash
npm install
```

## ActivityWatch Setup

Canopy does not collect raw activity by itself. It starts or reuses local ActivityWatch services and reads data from the ActivityWatch API at `http://localhost:5600`.

Right now, the app expects an unpacked ActivityWatch bundle inside this repo even if you already have ActivityWatch running separately. The current startup code resolves the bundle path before it checks whether an ActivityWatch server is already healthy.

Create one of these platform folders:

- `resources/activitywatch/linux`
- `resources/activitywatch/macos`
- `resources/activitywatch/windows`

Each platform folder must contain these binaries in the structure the app resolves at startup:

```text
resources/activitywatch/
  linux/
    aw-server/
      aw-server
    aw-watcher-window/
      aw-watcher-window
    aw-watcher-afk/
      aw-watcher-afk
```

On Windows, the executable names should end in `.exe`.

Extra files from a full ActivityWatch release are fine to keep alongside those folders. The important part is that these three executables exist at the paths above.

If you are on macOS or Linux and unpack the binaries manually, make sure they are executable:

```bash
chmod +x resources/activitywatch/<platform>/aw-server/aw-server
chmod +x resources/activitywatch/<platform>/aw-watcher-window/aw-watcher-window
chmod +x resources/activitywatch/<platform>/aw-watcher-afk/aw-watcher-afk
```

## OpenAI Setup

Create a repo-root `.env` file if you want Canopy to classify activity against the current planned block:

```bash
OPENAI_API_KEY=your_key_here
```

Without an API key, the app still runs, but automatic classification and coaching are disabled.

## Run In Development

```bash
npm run dev
```

On startup, Canopy will:

1. initialize the local SQLite database
2. start or reuse ActivityWatch
3. discover ActivityWatch buckets dynamically
4. open the calendar view and begin minute reconciliation in the background

## Build

```bash
npm run build
```

Platform packaging:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

## Local Data

The app database is stored in Electron user data, not in the repo. On Linux that is typically:

```text
~/.config/digital_balance/digital_balance.db
```

Some internal identifiers still use `digital_balance` today. The product name for the app is `Canopy`.

## Should ActivityWatch Binaries Be Committed?

No. Keep `resources/activitywatch/` in `.gitignore` and document the setup instead of checking the binaries into source control.

Why:

- the local ActivityWatch bundle is very large
- binaries are platform-specific
- they create noisy repository history and painful diffs
- release packaging is a better place to bundle them than git

The better approach is:

- keep the expected folder layout documented in this README
- download or unpack the correct bundle per platform during setup
- include the binaries in release artifacts, not in the repo itself

## Troubleshooting

- `ActivityWatch binaries not found`
  The folder layout under `resources/activitywatch/<platform>` does not match what the app resolves.

- `ActivityWatch not reachable`
  Check whether `aw-server` can start and bind to `localhost:5600`.

- `OPENAI_API_KEY missing or blank`
  The planner still works, but classification and coaching will stay off until `.env` is set.

## Coming Soon

Based on the current docs and architecture, the next major areas are:

- a fuller Projects surface instead of the current calendar-first workflow
- dedicated Stats and Feed sections
- richer diagnostics around ActivityWatch health, database setup, and persistence
- more adaptive coaching instead of simple prompt heuristics
- longer-term planning improvements such as richer project/task structure and possible external calendar sync
