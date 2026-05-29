from __future__ import annotations

# Run: cd backend && uvicorn main:app --reload --port 8000
# Or from repo root: uvicorn backend.main:app --reload --port 8000

"""
FastAPI backend for the Shimano APAC autonomous multi-agent S&OP system.
Provides SSE streaming, session management, and human-in-the-loop answer endpoints.
"""

import asyncio
import json
import time
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

import logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
# Quieten noisy third-party loggers
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("openai").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

from session import SessionState, sessions
from orchestrator import run_orchestrator
import mock_data

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Autopilot S&OP Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_GOAL = """
Q3-2026 S&OP Planning Cycle — Shimano APAC Manufacturing
Scope: 847 SKUs, 12 plants (SPL + SBMB), planning horizon W22–W34 (13 weeks)
Targets: OTIF ≥ 98%, Gross Margin ≥ 22%, Weeks of Supply 4–5 wks
Data sources: SAP S/4HANA, Supplier Portal, Tooling Asset Register
Constraints: Line 4 bottleneck (SPL-L3 at 92%), Supplier X lead-time extension (8 weeks)
"""

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class StartSession(BaseModel):
    goal: str = DEFAULT_GOAL
    name: str = ""


class AnswerBody(BaseModel):
    answer: str


def _derive_session_name(goal: str, session_id: str) -> str:
    """
    Heuristic fallback name from the goal text: prefer the first non-empty line,
    trimmed to a sensible length. Falls back to a short session id.
    """
    for line in (goal or "").splitlines():
        line = line.strip()
        if line:
            return line[:60]
    return f"Cycle {session_id[:8]}"


# ---------------------------------------------------------------------------
# SSE event generator
# ---------------------------------------------------------------------------
async def event_generator(session: SessionState):
    """
    Yields SSE-formatted events.
    First replays all existing events (for reconnections), then streams new ones.
    Sends keepalive comments every 15 seconds.
    Stops when session is done/error and the queue is empty.
    """
    # Replay existing events for clients that connect after start
    for evt in list(session.events):
        yield f"data: {json.dumps(evt)}\n\n"

    last_keepalive = time.time()

    while True:
        try:
            evt = await asyncio.wait_for(session.event_queue.get(), timeout=1.0)
            yield f"data: {json.dumps(evt)}\n\n"

            # Stop streaming once session is complete and queue is drained
            if session.status in ("done", "error") and session.event_queue.empty():
                break

        except asyncio.TimeoutError:
            # Send keepalive to prevent proxy/browser from closing connection
            if time.time() - last_keepalive > 15:
                yield ": keepalive\n\n"
                last_keepalive = time.time()

            # Check if we should stop
            if session.status in ("done", "error") and session.event_queue.empty():
                break


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

_DATASOURCE_PREVIEW = {
    "sap-mdg":         lambda: mock_data.get_bom_data(),
    "sap-mm":          lambda: mock_data.get_supplier_atp(),
    "sap-ibp":         lambda: mock_data.get_demand_history(),
    "sap-pp":          lambda: mock_data.get_production_orders(),
    "sap-ppcds":       lambda: mock_data.get_capacity_config(),
    "sap-wm":          lambda: {**mock_data.get_inventory_snapshot(), "abc": mock_data.get_abc_classification()},
    "sap-fico":        lambda: mock_data.run_milp_optimization({}),
    "sap-pm":          lambda: mock_data.get_tooling_data(),
    "supplier-portal": lambda: mock_data.get_supplier_atp(),
    "mes":             lambda: mock_data.get_production_orders(),
    "tooling-register":lambda: mock_data.get_tooling_data(),
    "erm":             lambda: mock_data.generate_risk_register(),
}


@app.get("/api/datasources/{source_id}/preview")
async def datasource_preview(source_id: str):
    fn = _DATASOURCE_PREVIEW.get(source_id)
    if fn is None:
        raise HTTPException(status_code=404, detail=f"No preview for '{source_id}'")
    return fn()


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "Autopilot S&OP Backend",
        "active_sessions": len(sessions),
    }


# IMPORTANT: /api/sessions/current and the list endpoint MUST be defined before
# /api/sessions/{session_id} to prevent FastAPI from matching "current" as a session_id.

def _session_summary(s: SessionState) -> dict:
    """Lightweight metadata for switcher / home listing."""
    return {
        "session_id": s.session_id,
        "name": s.name,
        "goal": s.goal,
        "status": s.status,
        "created_at": s.created_at,
        "elapsed": s.elapsed(),
        "kpis": s.kpis,
        "step_count": len(s.steps),
    }


@app.get("/api/sessions")
async def list_sessions():
    """List all sessions, newest first — drives the session switcher and home page."""
    ordered = sorted(sessions.values(), key=lambda s: s.created_at, reverse=True)
    return {"sessions": [_session_summary(s) for s in ordered]}


@app.get("/api/sessions/current")
async def get_current_session():
    """Return the most recently created session ID, or 404 if none."""
    if not sessions:
        raise HTTPException(status_code=404, detail="No active sessions")

    # Find the most recently created session
    latest = max(sessions.values(), key=lambda s: s.created_at)
    return _session_summary(latest)


@app.post("/api/sessions")
async def create_session(body: StartSession):
    """
    Create a new S&OP session and start the autonomous orchestrator in the background.
    Returns the session_id immediately; use the SSE endpoint to stream progress.
    """
    session_id = str(uuid.uuid4())
    name = (body.name or "").strip() or _derive_session_name(body.goal, session_id)
    session = SessionState(session_id=session_id, name=name, goal=body.goal)
    sessions[session_id] = session

    # Launch orchestrator as a background task
    bg_task = asyncio.create_task(run_orchestrator(session, body.goal))
    session.bg_task = bg_task

    return {
        "session_id": session_id,
        "name": name,
        "status": "running",
        "message": "S&OP session started. Connect to SSE endpoint to stream events.",
    }


@app.get("/api/sessions/{session_id}/events")
async def stream_events(session_id: str):
    """
    SSE endpoint — streams all S&OP events for a session.
    Replays historical events on reconnect, then streams new ones.
    """
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    return StreamingResponse(
        event_generator(session),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Return current state of a session."""
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    return {
        "session_id": session.session_id,
        "name": session.name,
        "goal": session.goal,
        "status": session.status,
        "elapsed": session.elapsed(),
        "kpis": session.kpis,
        "steps": session.steps,
        "pending_question": session.pending_question,
        "event_count": len(session.events),
    }


@app.post("/api/sessions/{session_id}/answer")
async def submit_answer(session_id: str, body: AnswerBody):
    """
    Submit a human answer for a paused session.
    The orchestrator is awaiting this answer at ask_human().
    """
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    if session.status != "paused":
        raise HTTPException(
            status_code=400,
            detail=f"Session is not paused (current status: '{session.status}'). No answer expected.",
        )

    if session.pending_question is None:
        raise HTTPException(
            status_code=400,
            detail="No pending question found for this session.",
        )

    await session.set_answer(body.answer)

    return {
        "session_id": session_id,
        "answer_accepted": True,
        "answer": body.answer,
        "status": session.status,
    }


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Cancel and remove a session."""
    session = sessions.pop(session_id, None)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    # Cancel the background orchestrator task if still running
    if session.bg_task and not session.bg_task.done():
        session.bg_task.cancel()
        try:
            await session.bg_task
        except asyncio.CancelledError:
            pass

    # Cancel any outstanding agent tasks
    for task_id, task in session.agent_tasks.items():
        if not task.done():
            task.cancel()

    return {"session_id": session_id, "deleted": True}
