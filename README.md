# Autopilot S&OP

An autonomous **multi-agent Sales & Operations Planning** system for Shimano
APAC manufacturing. A **Planner** agent orchestrates 11 specialist agents in
parallel to run a full S&OP cycle - demand forecasting → supply & capacity
reconciliation → a human decision checkpoint → optimization → financial & risk
sign-off - visualized live on a swimlane/timeline.

## Highlights
- **12 tool-using agents** (1 orchestrator + 11 specialists), each with its own
  system prompt, tools, and data source.
- **Two run modes** - **Demo** (scripted, deterministic, no backend) and
  **Live** (real agents via Azure OpenAI, streamed over SSE).
- **Planning cycles** - create, switch, terminate, and delete runs; finished
  runs are archived to disk and survive restarts.
- **Live pipeline** - swimlane & timeline views, dependency connectors, KPI bar,
  step drawer with full agent reasoning, and a human-in-the-loop decision modal.
- **Agent Console** - a "live agent activity" monitor.
- **Agents hub** - configure prompts/models and review performance & governance.
- **Planner chat** - a draggable assistant that can pull a run's context on demand.

## Stack
- **Frontend** - Vite + React 18 + TypeScript SPA, React Router v6, plain CSS.
- **Backend** - Python FastAPI, async orchestrator, SSE streaming, Azure OpenAI.

## Getting started

### Frontend
```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

### Backend (Dev)
```powershell
cd backend
uv run uvicorn main:app --reload --port 8000
```
### Backend (Window Server)
```powershell
cd backend
uv run uvicorn main:app --workers 4 --host 0.0.0.0 --port 8000
```
### Backend (Linux)
```powershell
cd backend
uv run gunicorn main:app -k uvicorn.workers.UvicornWorker --workers 4 --bind 0.0.0.0:8000 --reload
```

Demo mode needs no backend - toggle **Demo / Live** in the top bar. Live mode
requires the backend running with valid Azure credentials.

## Project structure
```
backend/    FastAPI app - orchestrator, agents, tools, sessions, persistence
frontend/   React SPA - pages, components, hooks
CLAUDE.md   Context & source-of-truth map for contributors / Claude Code
todo.md     Backlog
```

## Notes
- Azure credentials live only in `backend/.env` (gitignored).
- Completed/terminated sessions are archived to `backend/sessions/` (gitignored).
- See `CLAUDE.md` for an architecture map and `todo.md` for the roadmap.
