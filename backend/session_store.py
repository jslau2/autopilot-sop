from __future__ import annotations

"""
SQLite archive for terminal (completed / terminated) sessions.

Why: previously every archived run was a JSON file and ALL of them were loaded
into memory at startup — unbounded RAM + slow boot. Here, archived runs live in
one SQLite DB. Lists read only lightweight summary columns; the heavy run data
(steps/events) is stored as a JSON blob and hydrated into a SessionState
ONLY when a specific run is opened (lazy load).

A one-time migration folds any existing backend/sessions/*.json into the DB.
"""

import json
import logging
import sqlite3
import threading
import time
from pathlib import Path

from session import SessionState

log = logging.getLogger("session_store")

DB_FILE = Path(__file__).parent / "sessions.db"
LEGACY_DIR = Path(__file__).parent / "sessions"

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


# ---------------------------------------------------------------------------
# (de)serialisation — single source of truth for the on-disk session shape
# ---------------------------------------------------------------------------
def to_data(s: SessionState) -> dict:
    return {
        "session_id": s.session_id,
        "name": s.name,
        "goal": s.goal,
        "status": s.status,
        "created_at": s.created_at,
        "elapsed": s.elapsed(),
        "kpis": s.kpis,
        "steps": s.steps,
        "events": s.events,
        "pending_question": s.pending_question,
        "decisions": s.decisions,
        "approvals": s.approvals,
        "usage": s.usage,
        "parent_id": s.parent_id,
        "entity": s.entity,
    }


def from_data(data: dict) -> SessionState:
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
    s.usage = data.get("usage", s.usage)
    s.parent_id = data.get("parent_id", "")
    s.entity = data.get("entity", "")
    # Archived snapshots are terminal so the SSE replay exits cleanly.
    if s.status not in ("done", "error"):
        s.status = "done"
    return s


# ---------------------------------------------------------------------------
# DB lifecycle
# ---------------------------------------------------------------------------
def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    fresh = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    ).fetchone() is None
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            name TEXT DEFAULT '',
            goal TEXT DEFAULT '',
            status TEXT DEFAULT 'done',
            created_at REAL DEFAULT 0,
            elapsed REAL DEFAULT 0,
            kpis TEXT DEFAULT '{}',
            step_count INTEGER DEFAULT 0,
            parent_id TEXT DEFAULT '',
            entity TEXT DEFAULT '',
            updated_at REAL DEFAULT 0,
            data TEXT DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_entity ON sessions(entity);
        """
    )
    conn.commit()
    if fresh:
        _migrate_legacy_files(conn)
    return conn


def _migrate_legacy_files(conn: sqlite3.Connection) -> None:
    """One-time: import backend/sessions/*.json into the DB, then retire the dir."""
    if not LEGACY_DIR.exists() or not LEGACY_DIR.is_dir():
        return
    files = sorted(LEGACY_DIR.glob("*.json"))
    n = 0
    for f in files:
        try:
            data = json.loads(f.read_text())
            _upsert(conn, from_data(data))
            n += 1
        except Exception:
            log.warning("Skipping unreadable legacy session file %s", f.name)
    conn.commit()
    if n or files:
        try:
            LEGACY_DIR.rename(LEGACY_DIR.with_name("sessions.migrated"))
        except Exception:
            pass
        log.info("Migrated %d legacy session file(s) into SQLite", n)


def init() -> None:
    """Open the DB (idempotent), run migration on first boot."""
    global _conn
    with _lock:
        if _conn is None:
            _conn = _connect()


def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = _connect()
    return _conn


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------
def _upsert(conn: sqlite3.Connection, s: SessionState) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO sessions"
        " (session_id,name,goal,status,created_at,elapsed,kpis,step_count,parent_id,entity,updated_at,data)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (s.session_id, s.name, s.goal, s.status, s.created_at, s.elapsed(),
         json.dumps(s.kpis), len(s.steps), s.parent_id, s.entity, time.time(),
         json.dumps(to_data(s))),
    )


def save(session: SessionState) -> None:
    try:
        with _lock:
            conn = _db()
            _upsert(conn, session)
            conn.commit()
    except Exception:
        log.exception("Failed to archive session %s", session.session_id)


def _row_summary(r: sqlite3.Row) -> dict:
    return {
        "session_id": r["session_id"],
        "name": r["name"],
        "goal": r["goal"],
        "status": r["status"],
        "created_at": r["created_at"],
        "elapsed": r["elapsed"],
        "kpis": json.loads(r["kpis"] or "{}"),
        "step_count": r["step_count"],
        "parent_id": r["parent_id"],
        "entity": r["entity"],
    }


def summaries(entity: str = "") -> list[dict]:
    """Lightweight summaries for list views — never reads the heavy data blob."""
    with _lock:
        conn = _db()
        cols = "session_id,name,goal,status,created_at,elapsed,kpis,step_count,parent_id,entity"
        if entity:
            rows = conn.execute(
                f"SELECT {cols} FROM sessions WHERE entity=? ORDER BY created_at DESC", (entity,)
            ).fetchall()
        else:
            rows = conn.execute(
                f"SELECT {cols} FROM sessions ORDER BY created_at DESC"
            ).fetchall()
        return [_row_summary(r) for r in rows]


def name_of(session_id: str) -> str:
    with _lock:
        conn = _db()
        r = conn.execute("SELECT name FROM sessions WHERE session_id=?", (session_id,)).fetchone()
        return r["name"] if r else ""


def exists(session_id: str) -> bool:
    with _lock:
        conn = _db()
        return conn.execute("SELECT 1 FROM sessions WHERE session_id=?", (session_id,)).fetchone() is not None


def hydrate(session_id: str) -> SessionState | None:
    """Load a full SessionState from the archive (lazy — only when opened)."""
    with _lock:
        conn = _db()
        r = conn.execute("SELECT data FROM sessions WHERE session_id=?", (session_id,)).fetchone()
    if r is None:
        return None
    try:
        return from_data(json.loads(r["data"]))
    except Exception:
        log.exception("Failed to hydrate session %s", session_id)
        return None


def delete(session_id: str) -> None:
    try:
        with _lock:
            conn = _db()
            conn.execute("DELETE FROM sessions WHERE session_id=?", (session_id,))
            conn.commit()
    except Exception:
        log.exception("Failed to delete archived session %s", session_id)


def count() -> int:
    with _lock:
        conn = _db()
        return conn.execute("SELECT COUNT(*) c FROM sessions").fetchone()["c"]
