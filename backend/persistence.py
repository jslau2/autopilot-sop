from __future__ import annotations

"""
Lightweight JSON persistence for terminal (completed / terminated) sessions.

Running and paused sessions are intentionally NOT persisted: their live agent
execution state cannot be resumed across a backend restart. Only finished runs
are archived, so users can refer back to and compare previous cycles.
"""

import json
import logging
import time
from pathlib import Path

from session import SessionState

log = logging.getLogger("persistence")

SESSIONS_DIR = Path(__file__).parent / "sessions"


def _path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.json"


def save_session(session: SessionState) -> None:
    """Write an atomic JSON snapshot of a session to disk."""
    try:
        SESSIONS_DIR.mkdir(exist_ok=True)
        data = {
            "session_id": session.session_id,
            "name": session.name,
            "goal": session.goal,
            "status": session.status,
            "created_at": session.created_at,
            "elapsed": session.elapsed(),
            "kpis": session.kpis,
            "steps": session.steps,
            "events": session.events,
            "pending_question": session.pending_question,
            "decisions": session.decisions,
            "approvals": session.approvals,
            "parent_id": session.parent_id,
            "entity": session.entity,
        }
        tmp = SESSIONS_DIR / f".{session.session_id}.tmp"
        tmp.write_text(json.dumps(data))
        tmp.replace(_path(session.session_id))  # atomic on POSIX
    except Exception:
        log.exception("Failed to persist session %s", session.session_id)


def delete_session_file(session_id: str) -> None:
    """Remove a session's snapshot from disk (hard delete)."""
    try:
        _path(session_id).unlink(missing_ok=True)
    except Exception:
        log.exception("Failed to delete session file %s", session_id)


def load_sessions() -> dict[str, SessionState]:
    """Reconstruct archived sessions from disk on startup."""
    out: dict[str, SessionState] = {}
    if not SESSIONS_DIR.exists():
        return out

    for f in sorted(SESSIONS_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text())
        except Exception:
            log.warning("Skipping unreadable session file %s", f.name)
            continue

        s = SessionState(
            session_id=data["session_id"],
            name=data.get("name", ""),
            goal=data.get("goal", ""),
            status=data.get("status", "done"),
        )
        s.created_at = data.get("created_at", time.time())
        s.elapsed_final = data.get("elapsed", 0.0)
        s.kpis = data.get("kpis", s.kpis)
        s.steps = data.get("steps", {})
        s.events = data.get("events", [])
        s.pending_question = data.get("pending_question")
        s.decisions = data.get("decisions", [])
        s.approvals = data.get("approvals", [])
        s.parent_id = data.get("parent_id", "")
        s.entity = data.get("entity", "")
        # Archived snapshots are terminal so the SSE replay exits cleanly.
        if s.status not in ("done", "error"):
            s.status = "done"
        out[s.session_id] = s

    log.info("Loaded %d archived session(s) from disk", len(out))
    return out
