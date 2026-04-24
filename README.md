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
- For source-based development, either a local ActivityWatch bundle placed under `resources/activitywatch/<platform>` or an already-running local ActivityWatch server
- An optional repo-root `.env` file with `OPENAI_API_KEY` if you want automatic on-task classification and coaching

## Install

```bash
npm install
```

## macOS Beta Install

Private beta builds are published as DMGs through GitHub Releases.

1. Download the latest `Canopy-*.dmg` from Releases.
2. Drag `Canopy.app` into `/Applications`.
3. Open the app from Finder. Because this beta is unsigned and not notarized, macOS may require an extra confirmation step on first launch.
4. If window titles are missing, grant Accessibility permission to `Canopy.app`, then quit and reopen the app.

Known limitations for the beta DMG:

- the app is unsigned and not notarized
- there is no in-app auto-update flow yet
- missing macOS Accessibility permission can still allow app detection but not full window-title tracking

## ActivityWatch Setup

Canopy does not collect raw activity by itself. It starts or reuses local ActivityWatch services and reads data from the ActivityWatch API at `http://localhost:5600`.

The private beta DMG bundles a pinned ActivityWatch build automatically. The manual setup below is only required when you run Canopy directly from source.

On startup, Canopy first checks whether a local ActivityWatch server is already healthy at `http://localhost:5600`. If one is already running, Canopy reuses it.

If no healthy local ActivityWatch server is running, Canopy falls back to a bundled ActivityWatch layout under this repo:

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

On macOS, window-title capture may also require Accessibility permission for the process doing the tracking. If permission is missing, ActivityWatch may still see the active app but not the window title.

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

`npm run build:mac` now downloads a pinned official ActivityWatch macOS release, stages the bundled `ActivityWatch.app` under `resources/activitywatch/macos`, and then builds the Canopy DMG.

To override the bundled ActivityWatch release for a one-off local build:

```bash
ACTIVITYWATCH_VERSION=v0.13.2 npm run build:mac
```

The repo also includes a GitHub Actions workflow at `.github/workflows/release-macos-dmg.yml` that builds and publishes the private-beta DMG on tag pushes. It accepts an optional `ACTIVITYWATCH_VERSION` repository variable or `workflow_dispatch` input to pin a different upstream ActivityWatch release without changing the script.

## macOS Build And Test

Run these steps on a real Mac. The macOS prep script uses `hdiutil`, so it will not work on Linux or Windows.

### 1. Build the DMG locally

```bash
npm ci
npm run build:mac
```

To test a specific upstream ActivityWatch release:

```bash
ACTIVITYWATCH_VERSION=v0.13.2 npm run build:mac
```

### 2. Verify the build output

Confirm the DMG exists:

```bash
find dist -maxdepth 1 -name '*.dmg' -print
```

Confirm the packaged app contains the staged macOS ActivityWatch bundle:

```bash
find dist -path '*Canopy.app/Contents/Resources/resources/activitywatch/macos*' -maxdepth 6 -print
```

### 3. Smoke test the installed app

1. Open the DMG from `dist/`.
2. Drag `Canopy.app` into `/Applications`.
3. Launch it from Finder.
4. Verify ActivityWatch came up:

```bash
curl -sS http://localhost:5600/api/0/buckets
```

You should see bucket IDs that include `aw-watcher-window` and `aw-watcher-afk`.

### 4. Verify the two main macOS runtime cases

- Fresh machine case: no ActivityWatch running beforehand, then open Canopy and confirm the bundled watchers create buckets.
- Reuse case: start a healthy local ActivityWatch server first, then open Canopy and confirm Canopy reuses it instead of failing on missing bundled resources.

### 5. Verify macOS permission behavior

1. Launch Canopy without Accessibility permission granted.
2. Confirm the app opens, but window titles may be missing or incomplete.
3. Grant Accessibility permission to `Canopy.app`.
4. Quit and reopen the app.
5. Confirm window titles now populate correctly.

### 6. Test the GitHub release workflow

You can test the CI path either by using `workflow_dispatch` for `.github/workflows/release-macos-dmg.yml` or by pushing a version tag:

```bash
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1
```

For CI runs, confirm that:

- the workflow uploads a DMG artifact
- tag-triggered runs create a prerelease with the DMG attached
- the release notes mention the pinned ActivityWatch version used for that build

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
- download or unpack the correct bundle per platform during setup, or fetch it during CI/build prep
- include the binaries in release artifacts, not in the repo itself

## Troubleshooting

- `ActivityWatch binaries not found`
  The folder layout under `resources/activitywatch/<platform>` does not match what the app resolves.

- `ActivityWatch not reachable`
  Check whether `aw-server` can start and bind to `localhost:5600`.

- macOS says the app cannot be opened
  This beta DMG is unsigned and not notarized. Open `Canopy.app` from Finder and follow the extra macOS trust prompt.

- `OPENAI_API_KEY missing or blank`
  The planner still works, but classification and coaching will stay off until `.env` is set.

## Coming Soon

Based on the current docs and architecture, the next major areas are:

- a fuller Projects surface instead of the current calendar-first workflow
- dedicated Stats and Feed sections
- richer diagnostics around ActivityWatch health, database setup, and persistence
- more adaptive coaching instead of simple prompt heuristics
- longer-term planning improvements such as richer project/task structure and possible external calendar sync
