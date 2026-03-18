# FocusLens (digital_balance)

FocusLens is an Electron desktop app that tracks active window usage with ActivityWatch and classifies activity against your weekly goal using an OpenAI-powered Python sidecar.

## What Runs

- Electron main process (`src/main/index.ts`)
- ActivityWatch server (`localhost:5600`) + `aw-watcher-window`
- Python analyzer sidecar (`backend/sidecar/analyzer.py`, `localhost:5001`)
- React renderer (`src/renderer`)

## Prerequisites

- Node.js 20+ and npm
- Python 3.10+ (3.11 recommended)
- macOS, Linux, or Windows

Linux note:
- Use Xorg for `aw-watcher-window` compatibility (Wayland can be problematic).

## Install

1. Clone and enter the project:

```bash
git clone <your-repo-url>
cd digital_balance
```

2. Create the Python virtual environment expected by the app (`.venv` at project root):

```bash
python3 -m venv .venv
```

3. Activate the virtual environment and install sidecar dependencies:

macOS/Linux:
```bash
source .venv/bin/activate
pip install --upgrade pip
pip install openai
```

Windows (PowerShell):
```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install openai
```

4. Install Node dependencies:

```bash
npm install
```

5. Create `.env` in the project root:

```env
OPENAI_API_KEY=sk-...
```

## ActivityWatch Binaries Setup

The app launches bundled ActivityWatch binaries from:

- `resources/activitywatch/macos`
- `resources/activitywatch/linux`
- `resources/activitywatch/windows`

### Steps

1. Download an ActivityWatch release archive from:
- https://github.com/ActivityWatch/activitywatch/releases

2. Create your platform directory if needed:

```bash
mkdir -p resources/activitywatch/<platform>
```

Use:
- `<platform> = macos` on macOS
- `<platform> = linux` on Linux
- `<platform> = windows` on Windows

3. Extract ActivityWatch files into that folder so these exist:
- `resources/activitywatch/<platform>/aw-server/aw-server` (or `.exe` on Windows)
- `resources/activitywatch/<platform>/aw-watcher-window/aw-watcher-window` (or `.exe` on Windows)

4. On macOS/Linux, ensure binaries are executable:

```bash
chmod +x resources/activitywatch/<platform>/aw-server/aw-server
chmod +x resources/activitywatch/<platform>/aw-watcher-window/aw-watcher-window
```

## Run in Development

```bash
npm run dev
```

On launch, Electron will:
- start/reuse ActivityWatch server at `127.0.0.1:5600`
- start `aw-watcher-window`
- start Python sidecar at `127.0.0.1:5001`

## Build

```bash
npm run build
```

Platform packages:

```bash
npm run build:mac
npm run build:linux
npm run build:win
```

## Helpful Commands

```bash
npm run typecheck
npm run lint
npm run format
```

## Troubleshooting

- `Venv Python binary not found`: confirm `.venv` exists in the project root.
- `OPENAI_API_KEY missing in .env`: confirm `.env` exists and includes `OPENAI_API_KEY`.
- `ActivityWatch binaries not found`: verify files are in `resources/activitywatch/<platform>/...`.
- `Failed to start ActivityWatch services`: check executable permissions and platform folder naming.
