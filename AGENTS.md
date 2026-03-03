# FocusLens

## Project Context
Electron + React/TypeScript desktop app that wraps ActivityWatch (open source local time tracker) and adds AI-powered goal-aware productivity analysis.

ActivityWatch runs as a local Python/Flask server on `localhost:5600` and exposes a REST API for window/tab/AFK events. The Electron app spawns ActivityWatch and its watchers as child processes on startup, polls the ActivityWatch API for events, and passes them to a Python sidecar that handles debounce logic, screenshots, and LLM classification. Classifications are stored in a local SQLite DB. The renderer communicates with the main process via Electron IPC (contextBridge/preload pattern).

## Key Architecture
```
Electron Main (src/main/index.ts)
  → spawns aw-server (localhost:5600)
  → spawns aw-watcher-window
  → spawns backend/sidecar/analyzer.py
  → handles IPC from renderer

Preload (src/preload/index.ts)
  → contextBridge exposes safe APIs to renderer

Renderer (src/renderer/)
  → React UI: calendar view, goal setter, session report, AI toggle

Python Sidecar (backend/sidecar/analyzer.py)
  → polls localhost:5600 for window events
  → 30s debounce after event trigger
  → screenshot every 5 mins
  → LLM call (metadata first, screenshot fallback)
  → stores classifications in focuslens.db (SQLite)
```

## Key Files
- `src/main/index.ts` — spawns AW processes, handles IPC, manages process lifecycle
- `src/preload/index.ts` — exposes getEvents, getGoals, getClassifications, toggleAI
- `backend/sidecar/analyzer.py` — screenshot + LLM classification loop
- `resources/activitywatch/` — prebuilt AW binaries per platform

## ActivityWatch API (localhost:5600)
```
GET  /api/0/buckets/                          # list all buckets
GET  /api/0/buckets/{id}/events               # get events from watcher
POST /api/0/query/                            # query across buckets
GET  /api/0/info                              # server info / health check
```
Window events come from bucket: `aw-watcher-window_{hostname}`
Each event: `{ timestamp, duration, data: { app, title } }`

## Core Features
- **Weekly Goals** — user defines 1-5 goals, used as LLM classification lens
- **Smart Screenshots** — 30s after trigger, then every 5 mins
- **AI Toggle** — pause analysis for personal use, time logged as "personal"
- **LLM Classification** — metadata first
- **Calendar View** — Memtime-style color-coded goal blocks
- **Session Report** — per-tab distraction tags + qualitative summary

## Platform Notes
- Primary target: macOS
- Linux dev environment: Ubuntu on Xorg (not Wayland — pynput/Xlib incompatibility)
- AFK detection skipped for now
- AW binaries in resources/ are platform-specific, not committed to git

## Dev Setup
```bash
# Python
python -m venv .venv
source .venv/bin/activate
pip install aw-server aw-watcher-window

# Node
npm install

# AW binaries (download from github.com/ActivityWatch/activitywatch/releases)
# unzip into resources/activitywatch/{platform}/
# chmod +x on mac/linux
```

---

## Workflow Orchestration
### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.