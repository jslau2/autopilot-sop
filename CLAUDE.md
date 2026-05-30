# CLAUDE.md — Autopilot S&OP

Project context for Claude Code sessions. Read this first.

## What this is
**Autopilot S&OP** — an autonomous **multi-agent Sales & Operations Planning**
system for Shimano APAC manufacturing. A Planner agent orchestrates 11
specialist agents in parallel to run a full S&OP cycle (demand → supply →
human decision → optimization → financial/risk sign-off), with a live UI.

Two run modes:
- **Demo** — scripted, deterministic simulation in the frontend; no backend
  needed. Great for showing the product.
- **Live** — real agents via Azure OpenAI through the FastAPI backend (SSE
  streaming). Requires `backend/.env` with Azure creds.

The demo/live toggle is global (top-bar switch); state in `localStorage`
(`sop-demo-mode`).

## Stack & layout
- **frontend/** — Vite + React 18 + TypeScript SPA, React Router v6. Plain CSS
  (`src/styles/globals.css`), no UI framework. Inline styles use `oklch(...)`.
- **backend/** — Python FastAPI, async orchestrator, SSE event streaming,
  Azure OpenAI SDK. In-memory sessions + JSON persistence for finished runs.

## Run it
- Backend: `cd backend && uvicorn main:app --reload --port 8000`
  (deps in `requirements.txt`; Azure creds in `backend/.env`, gitignored).
- Frontend: `cd frontend && npm run dev` (Vite proxies `/api` → `localhost:8000`).
- Build check: `cd frontend && npm run build` (runs `tsc -b && vite build`).

## Source-of-truth map (don't duplicate into docs — read these)
Backend:
- `backend/agent_defs.py` — the 12 agents: id, name, `system_prompt`, `tools`,
  `data_source`. Adding/with-tools an agent happens here.
- `backend/orchestrator.py` — Planner loop: dispatches agents, waits, asks the
  human, completes. Planner tools live here.
- `backend/workers.py` — how each specialist agent runs its tool-use loop.
- `backend/mock_data.py` — the data/compute behind agent tools + Data Sources
  preview.
- `backend/session.py` — `SessionState` (events, steps, kpis, status, …) and
  the global `sessions` registry; `emit_*` helpers.
- `backend/persistence.py` — JSON archive of **terminal** sessions
  (`backend/sessions/*.json`, gitignored); loaded on startup.
- `backend/main.py` — FastAPI routes (sessions CRUD, SSE, chat, datasource
  preview, suggest-name) + the Planner chat tools (`CHAT_TOOLS`).

Frontend:
- `src/data/agents.ts` — agent display names/colors. NB: `rawColor` holds actual
  `oklch(...)` because **CSS custom properties don't resolve in SVG presentation
  attributes** (swimlane connectors must use `rawColor`).
- `src/components/AppShell.tsx` — persistent top nav: **Home · Cycle · Agent
  Console · Agents · Data Sources** + global demo/live toggle.
- `src/pages/PipelineView.tsx` — the **Cycle** workspace: `PipelineLanding`
  (no session), `PipelineRun` (a session, keyed by id), `SessionSwitcher`,
  breadcrumb, Focus mode. Picks `useSimulation` (demo) or `useLiveSession`.
- `src/pages/Home.tsx` — lists Planning Cycles (paginated) + nav cards.
- `src/pages/Agents.tsx` — Agents Hub: tabs Configure (`AgentSettings`) /
  Performance (`AgentManager`), both rendered with `embedded` prop.
- `src/pages/AgentConsole.tsx` — "Live Agent Activity" view (currently scripted;
  north-star: live across sessions/users — see todo.md).
- `src/pages/DataSources.tsx`, `src/components/PlannerChat.tsx` (global chat),
  `src/components/Swimlane.tsx` / `Timeline.tsx`.
- Hooks: `useSimulation`, `useLiveSession` (connects to a session by id; SSE
  replays history then streams; no DELETE on unmount), `useLaunchCycle`,
  `useDemoMode` (shared store).

## Mental model / IA
**Home** lists cycles → a **Cycle** is the pipeline workspace you open from it →
**Agent Console** is the cross-run activity view → **Agents** and **Data
Sources** are config/reference. Pipeline has a **Focus mode** that hides the
shell.

## Sessions lifecycle
Create (`POST /api/sessions`) → switch (URL `/pipeline/:sessionId`, SSE replay
rebuilds state) → terminate (`POST /api/sessions/{id}/terminate`, keeps +
archives) → delete (`DELETE`, hard remove). Completed/terminated sessions
persist to disk and survive restarts; in-flight sessions are memory-only.

## Conventions & gotchas
- Use `rawColor` (not CSS vars) for any color in SVG attributes.
- Many UI prefs persist in `localStorage`: `sop-demo-mode`, `sop-focus-mode`,
  `sop-sidebar-collapsed`, `sop-chat-pos`, `sop-chat-history`, `sop-tour-done`.
- Keep **Azure creds in `backend/.env` only** (gitignored) — never commit.
- `backend/sessions/` is gitignored.
- Commit only when asked; branch off main for larger work; open a draft PR.

## Backlog
See `todo.md` (run comparison, live multi-session/user Console, report export,
notifications, scenario branching, etc.).
