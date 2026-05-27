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

from session import SessionState, sessions
from orchestrator import run_orchestrator

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


class AnswerBody(BaseModel):
    answer: str


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

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "Autopilot S&OP Backend",
        "active_sessions": len(sessions),
    }


# IMPORTANT: /api/sessions/current MUST be defined before /api/sessions/{session_id}
# to prevent FastAPI from matching "current" as a session_id.

@app.get("/api/sessions/current")
async def get_current_session():
    """Return the most recently created session ID, or 404 if none."""
    if not sessions:
        raise HTTPException(status_code=404, detail="No active sessions")

    # Find the most recently created session
    latest = max(sessions.values(), key=lambda s: s.created_at)
    return {
        "session_id": latest.session_id,
        "status": latest.status,
        "created_at": latest.created_at,
        "kpis": latest.kpis,
    }


@app.post("/api/sessions")
async def create_session(body: StartSession):
    """
    Create a new S&OP session and start the autonomous orchestrator in the background.
    Returns the session_id immediately; use the SSE endpoint to stream progress.
    """
    session_id = str(uuid.uuid4())
    session = SessionState(session_id=session_id)
    sessions[session_id] = session

    # Launch orchestrator as a background task
    bg_task = asyncio.create_task(run_orchestrator(session, body.goal))
    session.bg_task = bg_task

    return {
        "session_id": session_id,
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
