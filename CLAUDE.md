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
- `backend/agents/agent_defs.py` — the 12 agents: id, name, `phase`,
  `system_prompt`, `tools`, `data_source`. Adding/with-tools an agent happens
  here; `phase` (1/2/4/5) drives the generated playbook.
- `backend/agents/orchestrator.py` — Planner loop: dispatches agents, waits, asks
  the human, completes. Planner tools live here. The route is **not** hardcoded:
  at run start it resolves the active agent set and builds the dispatch enum +
  playbook from it (see `routing.py`).
- `backend/agents/routing.py` — dynamic routing. `resolve_active_agents` =
  (per-run subset, if any) ∩ (enabled in Agent Settings); `build_planner_tools`
  narrows the `dispatch_agent` enum (hard gate); `build_playbook` regenerates the
  PHASE text from each agent's `phase` (the Phase-3 human checkpoint is
  conditional on demand/capacity being active). Per-run subset arrives via
  `agents:[]` on `POST /api/sessions` (or kickoff) → `SessionState.active_agents`;
  enable/disable is an `enabled` flag in `agent_config` (planner never disable-able).
- `backend/workers.py` — how each specialist agent runs its tool-use loop.
  `TOOL_DISPATCH` is the seam where agent tools resolve to compute; engine-backed
  tools call `backend/engines/*` and fall back to `mock_data` via `or`. Each tool
  call is offloaded to a thread (`run_in_executor`) so a slow engine (HTTP / MILP
  solve) never blocks the event loop.
- `backend/engines/` — clients for the real deterministic engines, mirroring the
  `bom_graph.py` contract (config from `.env`, `None` on failure → mock fallback).
  `forecast_client` → incoming-sales-booking-curve (demand agent); `planning_client`
  → fg-planning-optimizer MIP/LP (optimizer agent); `grain_map` + `handoff` chain
  the demand forecast into the optimizer's demand input within a run. URLs in
  `.env` (`FORECAST_ENGINE_URL`, `OPTIMIZER_ENGINE_URL`). See
  `docs/integration-engines.md`; run all three services via `docker-compose.yml`.
- `backend/mock_data.py` — the data/compute behind agent tools + Data Sources
  preview.
- `backend/session.py` — `SessionState` (events, steps, kpis, status, …) and
  the global `sessions` registry; `emit_*` helpers.
- `backend/session_store.py` — SQLite archive of **terminal** sessions
  (`backend/sessions.db`, gitignored). Lists read summary columns; full runs are
  **hydrated lazily** when opened (not bulk-loaded at startup). One-time
  migration folds legacy `sessions/*.json` in. `persistence.py` is a thin shim
  delegating here (`save_session`/`delete_session_file`). In `main.py`,
  `_get_session(id)` returns the live session or hydrates from the store (LRU).
- `backend/main.py` — FastAPI routes (sessions CRUD, SSE, chat + streaming,
  conversation history CRUD, datasource preview, suggest-name, kickoff,
  exec-summary, decisions, approvals, usage, share, notifications, schedules) +
  the Planner chat tools (`CHAT_TOOLS`).
- `backend/chat_store.py` — SQLite store for planner-chat **conversation
  history** (`backend/chat.db`, gitignored). One continuous chat that never
  switches on navigation; the user explicitly picks past conversations. Scoped by
  `owner` = a per-browser UUID the frontend sends in the `X-Client-Id` header (no
  login yet — migrates to user email when auth lands). Lists read summary columns;
  the message thread is a JSON blob hydrated on open. The Planner chat endpoints
  are stateless — the frontend persists each thread via
  `PUT /api/conversations/{id}/messages` (auto-titles from the first user message).
- Feature modules: `feedback_store.py` (👍/👎), `uploads.py` (run-on-your-data),
  `notifications.py` (alerts + webhook), `shares.py` (read-only links),
  `scheduler.py` (recurring runs). These (plus `agents/agent_config.py`'s
  per-agent overrides) all persist to one shared SQLite db, `backend/app.db`
  (gitignored) — each module owns its own table(s) + connection (WAL, lazy
  connect), mirroring `session_store`/`chat_store`. `uploads.py` stays in-memory.
  `SessionState` also carries `decisions`, `approvals`, and `usage`.

Frontend:
- `src/data/agents.ts` — agent display names/colors. NB: `rawColor` holds actual
  `oklch(...)` because **CSS custom properties don't resolve in SVG presentation
  attributes** (swimlane connectors must use `rawColor`).
- `src/components/AppShell.tsx` — persistent top nav: **Home · Cycle · Agent
  Console · Agents · Data Sources** + global demo/live toggle.
- `src/pages/PipelineView.tsx` — the **Cycle** workspace: `PipelineLanding`
  (no session), `PipelineRun` (a session, keyed by id), `SessionSwitcher`,
  breadcrumb, Focus mode. Picks `useSimulation` (demo) or `useLiveSession`.
- `src/pages/Home.tsx` — conversational kickoff + scenario templates + Planning
  Cycles (paginated) + nav cards.
- `src/pages/Compare.tsx` (scenario comparison), `Schedules.tsx` (recurring
  runs), `SharePage.tsx` (public read-only). Pipeline modals: `ReportModal`,
  `DecisionLogModal`, `ValueDashboardModal`, `WhatIfModal`, `ExplainModal`,
  `ApprovalsModal`; `NotificationCenter` + `FeedbackControl` are app-wide.
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
  `sop-sidebar-collapsed`, `sop-chat-pos`, `sop-tour-done`. Chat history is now
  server-side; `localStorage` only keeps `sop-client-id` (owner UUID) and
  `sop-chat-active` (last-opened conversation). `sop-chat-history` is legacy —
  read once on first open to migrate the old single thread, then removed.
- Keep **Azure creds in `backend/.env` only** (gitignored) — never commit.
- `backend/sessions/` is gitignored.
- Commit only when asked; branch off main for larger work; open a draft PR.
- When creating a new Git branch, use a meaningful, descriptive feature name (for example: `feature/demand-forecast-tuning`).

## Backlog
See `todo.md` (run comparison, live multi-session/user Console, report export,
notifications, scenario branching, etc.).
