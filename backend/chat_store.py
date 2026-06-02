from __future__ import annotations

"""
SQLite store for planner-chat conversation history.

Each conversation is owned by a `client_id` — a stable UUID the frontend keeps in
localStorage (`sop-client-id`). There is no user login yet, so this scopes history
to a browser/device rather than a person; when real auth arrives the `owner`
column can be migrated from client-id to the user's email.

List views read only lightweight summary columns; the message thread is stored as
a JSON blob and hydrated only when a conversation is opened (lazy load), mirroring
session_store.
"""

import json
import logging
import sqlite3
import threading
import time
import uuid
from pathlib import Path

log = logging.getLogger("chat_store")

DB_FILE = Path(__file__).parent / "chat.db"

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


# ---------------------------------------------------------------------------
# DB lifecycle
# ---------------------------------------------------------------------------
def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            owner TEXT DEFAULT '',
            title TEXT DEFAULT '',
            created_at REAL DEFAULT 0,
            updated_at REAL DEFAULT 0,
            run_hint TEXT DEFAULT '',
            message_count INTEGER DEFAULT 0,
            messages TEXT DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_conv_owner ON conversations(owner, updated_at);
        """
    )
    conn.commit()
    return conn


def init() -> None:
    """Open the DB (idempotent)."""
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
# CRUD — every read/write is scoped by owner so devices can't see each other.
# ---------------------------------------------------------------------------
def create(owner: str, title: str = "", run_hint: str = "") -> dict:
    cid = str(uuid.uuid4())
    now = time.time()
    with _lock:
        conn = _db()
        conn.execute(
            "INSERT INTO conversations (id,owner,title,created_at,updated_at,run_hint,message_count,messages)"
            " VALUES (?,?,?,?,?,?,0,'[]')",
            (cid, owner, title, now, now, run_hint),
        )
        conn.commit()
    return {"id": cid, "title": title, "created_at": now, "updated_at": now,
            "run_hint": run_hint, "message_count": 0}


def list_conversations(owner: str) -> list[dict]:
    """Lightweight summaries for the history list — never reads the message blob."""
    with _lock:
        conn = _db()
        rows = conn.execute(
            "SELECT id,title,created_at,updated_at,run_hint,message_count"
            " FROM conversations WHERE owner=? ORDER BY updated_at DESC",
            (owner,),
        ).fetchall()
    return [{
        "id": r["id"], "title": r["title"], "created_at": r["created_at"],
        "updated_at": r["updated_at"], "run_hint": r["run_hint"],
        "message_count": r["message_count"],
    } for r in rows]


def get(conv_id: str, owner: str) -> dict | None:
    """Full conversation incl. messages (lazy — only when opened)."""
    with _lock:
        conn = _db()
        r = conn.execute(
            "SELECT id,title,created_at,updated_at,run_hint,message_count,messages"
            " FROM conversations WHERE id=? AND owner=?",
            (conv_id, owner),
        ).fetchone()
    if r is None:
        return None
    try:
        messages = json.loads(r["messages"] or "[]")
    except Exception:
        messages = []
    return {
        "id": r["id"], "title": r["title"], "created_at": r["created_at"],
        "updated_at": r["updated_at"], "run_hint": r["run_hint"],
        "message_count": r["message_count"], "messages": messages,
    }


def _derive_title(messages: list[dict]) -> str:
    """First user message, trimmed — a reliable title without an extra LLM call."""
    for m in messages:
        if m.get("role") == "user" and (m.get("content") or "").strip():
            t = " ".join(m["content"].split())
            return t[:48] + ("…" if len(t) > 48 else "")
    return "New chat"


def save_messages(conv_id: str, owner: str, messages: list[dict], run_hint: str = "") -> dict | None:
    """Replace the stored thread. Auto-titles from the first user message if untitled."""
    with _lock:
        conn = _db()
        r = conn.execute(
            "SELECT title FROM conversations WHERE id=? AND owner=?", (conv_id, owner)
        ).fetchone()
        if r is None:
            return None
        title = (r["title"] or "").strip() or _derive_title(messages)
        now = time.time()
        conn.execute(
            "UPDATE conversations SET messages=?, message_count=?, title=?, updated_at=?, run_hint=?"
            " WHERE id=? AND owner=?",
            (json.dumps(messages), len(messages), title, now,
             run_hint or "", conv_id, owner),
        )
        conn.commit()
    return {"id": conv_id, "title": title, "message_count": len(messages), "updated_at": now}


def rename(conv_id: str, owner: str, title: str) -> bool:
    with _lock:
        conn = _db()
        cur = conn.execute(
            "UPDATE conversations SET title=?, updated_at=? WHERE id=? AND owner=?",
            (title[:80], time.time(), conv_id, owner),
        )
        conn.commit()
        return cur.rowcount > 0


def delete(conv_id: str, owner: str) -> bool:
    with _lock:
        conn = _db()
        cur = conn.execute(
            "DELETE FROM conversations WHERE id=? AND owner=?", (conv_id, owner)
        )
        conn.commit()
        return cur.rowcount > 0
