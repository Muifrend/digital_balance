# Canopy

Canopy is a local-first desktop app for planning your day against what your computer actually did. It pairs a planner with ActivityWatch-backed activity capture, stores data locally in SQLite, and can use OpenAI to classify whether recent activity matched the block you intended to work on.

## What It Does

- Shows planned blocks and captured activity in a single-day view
- Reads ActivityWatch window and AFK events from your machine
- Stores planning, activity, and classification data locally
- Surfaces coaching prompts when recent activity drifts from the active plan
- Includes a built-in Demo flow for first-time users

## macOS Beta Install

Private beta builds are published as DMGs through GitHub Releases.

1. Download the latest `Canopy-*.dmg` from Releases.
2. Drag `Canopy.app` into `/Applications`.
3. For first launch, open Canopy from Terminal so macOS can surface both the Canopy and bundled ActivityWatch Accessibility prompts while logs are visible:

```bash
/Applications/Canopy.app/Contents/MacOS/Canopy
```

4. Grant Accessibility permission when macOS prompts. Canopy may prompt first, but the bundled ActivityWatch watcher also needs its own Accessibility permission because it reads window titles.
5. If ActivityWatch does not prompt or window titles are missing, reveal the bundled ActivityWatch app and add it to **System Settings -> Privacy & Security -> Accessibility**, then quit and reopen Canopy:

```bash
open -R /Applications/Canopy.app/Contents/Resources/resources/activitywatch/macos/ActivityWatch.app
```

6. Once Canopy opens, press the **Demo** button in the top navigation to see how the planner, activity lane, projects, analytics, and settings fit together.

Known beta limitations:

- The app is unsigned and not notarized.
- There is no in-app auto-update flow yet.
- Missing Accessibility permission for the bundled `ActivityWatch.app` can still allow app detection but prevent full window-title tracking.

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Optional OpenAI classification uses a repo-root `.env` file:

```bash
OPENAI_API_KEY=your_key_here
```

Without an API key, the planner still works, but automatic classification and coaching are disabled.

## Build

Typecheck and build the app:

```bash
npm run build
```

Build the macOS DMG:

```bash
npm run build:mac
```

`npm run build:mac` must run on macOS. It downloads the pinned ActivityWatch macOS release, stages the bundled `ActivityWatch.app`, and builds `dist/Canopy-<version>.dmg`.

Useful overrides:

```bash
ACTIVITYWATCH_VERSION=v0.13.2 npm run build:mac
MAC_BUILD_ARCH=x64 npm run build:mac
```

## Release

The GitHub Actions workflow at `.github/workflows/release-macos-dmg.yml` builds and publishes the private-beta DMG when a `v*` tag is pushed.

```bash
git tag -a v1.0.0 -m "Canopy v1.0.0"
git push origin v1.0.0
```

## Troubleshooting

- `ActivityWatch is not allowed assistive access`
  Add the bundled ActivityWatch app to macOS Accessibility:
  `/Applications/Canopy.app/Contents/Resources/resources/activitywatch/macos/ActivityWatch.app`

- `ActivityWatch not reachable`
  Check whether the local server is responding:

```bash
curl -sS http://localhost:5600/api/0/buckets
```

- `OPENAI_API_KEY missing or blank`
  Classification is disabled, but the planner still works.

