from __future__ import annotations

"""
Lightweight append-only store for in-app user feedback (👍 / 👎 + comment) on
agent outputs and whole runs. Feeds the Agent Manager governance analytics.

Persisted in the shared backend/app.db (gitignored), one row per feedback entry.
"""

import logging
import sqlite3
import threading
import time
import uuid
from pathlib import Path

log = logging.getLogger("feedback")

DB_FILE = Path(__file__).parent.parent / "app.db"

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS feedback (
            id TEXT PRIMARY KEY,
            ts REAL DEFAULT 0,
            session_id TEXT DEFAULT '',
            target TEXT DEFAULT 'run',
            target_label TEXT DEFAULT '',
            agent_id TEXT DEFAULT '',
            rating TEXT DEFAULT 'up',
            comment TEXT DEFAULT ''
        )
        """
    )
    conn.commit()
    return conn


def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = _connect()
    return _conn


def _row(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"], "ts": r["ts"], "session_id": r["session_id"],
        "target": r["target"], "target_label": r["target_label"],
        "agent_id": r["agent_id"], "rating": r["rating"], "comment": r["comment"],
    }


def record(entry: dict) -> dict:
    """Append a feedback entry, stamping id + timestamp. Returns the stored row."""
    row = {
        "id": uuid.uuid4().hex[:12],
        "ts": time.time(),
        "session_id": entry.get("session_id", ""),
        "target": entry.get("target", "run"),       # "run" | step_id
        "target_label": entry.get("target_label", ""),
        "agent_id": entry.get("agent_id", ""),       # which agent produced the output (if any)
        "rating": "down" if entry.get("rating") == "down" else "up",
        "comment": (entry.get("comment") or "")[:1000],
    }
    try:
        with _lock:
            conn = _db()
            conn.execute(
                "INSERT INTO feedback (id,ts,session_id,target,target_label,agent_id,rating,comment)"
                " VALUES (:id,:ts,:session_id,:target,:target_label,:agent_id,:rating,:comment)",
                row,
            )
            conn.commit()
    except Exception:
        log.exception("Failed to write feedback store")
    return row


def list_feedback(session_id: str = "") -> list[dict]:
    with _lock:
        conn = _db()
        if session_id:
            rows = conn.execute(
                "SELECT * FROM feedback WHERE session_id=? ORDER BY ts DESC", (session_id,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM feedback ORDER BY ts DESC").fetchall()
    return [_row(r) for r in rows]


def summary() -> dict:
    """Aggregate counts for governance analytics."""
    items = list_feedback()
    up = sum(1 for r in items if r.get("rating") == "up")
    down = sum(1 for r in items if r.get("rating") == "down")
    by_agent: dict[str, dict] = {}
    for r in items:
        aid = r.get("agent_id") or "(run)"
        a = by_agent.setdefault(aid, {"agent_id": aid, "up": 0, "down": 0})
        a[r.get("rating", "up")] += 1
    recent_comments = [
        {
            "agent_id": r.get("agent_id", ""),
            "rating": r.get("rating"),
            "comment": r.get("comment"),
            "target_label": r.get("target_label", ""),
            "ts": r.get("ts"),
        }
        for r in items  # already sorted ts desc
        if r.get("comment")
    ][:20]
    total = up + down
    return {
        "total": total,
        "up": up,
        "down": down,
        "satisfaction": round(up / total * 100, 1) if total else None,
        "by_agent": sorted(by_agent.values(), key=lambda a: a["up"] + a["down"], reverse=True),
        "recent_comments": recent_comments,
    }
