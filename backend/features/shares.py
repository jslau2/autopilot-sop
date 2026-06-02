from __future__ import annotations

"""
Shareable read-only links for a run / its report. A short token maps to a
session_id; the mapping is persisted (in the shared backend/app.db) so links
survive a restart (for archived runs). The shared payload is a read-only
snapshot — no controls, no live stream.
"""

import logging
import secrets
import sqlite3
import threading
from pathlib import Path

log = logging.getLogger("shares")

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
        "CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, session_id TEXT DEFAULT '')"
    )
    conn.commit()
    return conn


def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = _connect()
    return _conn


def create_token(session_id: str) -> str:
    """Return an existing token for the session, or mint a new one."""
    with _lock:
        conn = _db()
        r = conn.execute(
            "SELECT token FROM shares WHERE session_id=?", (session_id,)
        ).fetchone()
        if r is not None:
            return r["token"]
        tok = secrets.token_urlsafe(9)
        conn.execute(
            "INSERT INTO shares (token, session_id) VALUES (?, ?)", (tok, session_id)
        )
        conn.commit()
        return tok


def resolve(token: str) -> str | None:
    with _lock:
        r = _db().execute(
            "SELECT session_id FROM shares WHERE token=?", (token,)
        ).fetchone()
    return r["session_id"] if r else None
