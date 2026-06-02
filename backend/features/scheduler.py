from __future__ import annotations

"""
Scheduled / recurring autonomous runs — the literal "autopilot" promise.
Stores schedule definitions (cadence + goal) and computes when each is next due.
The actual launching is driven by a loop in main.py (which owns session
creation); this module just holds + persists the definitions.
"""

import json
import logging
import sqlite3
import threading
import time
import uuid
from pathlib import Path

log = logging.getLogger("scheduler")

DB_FILE = Path(__file__).parent.parent / "app.db"

CADENCE_SECONDS = {
    "hourly": 3600,
    "daily": 86400,
    "weekly": 604800,
}

# in-memory registry (source of truth at runtime; mirrored into the schedules table)
schedules: dict[str, dict] = {}

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schedules (id TEXT PRIMARY KEY, data TEXT DEFAULT '{}')"
    )
    conn.commit()
    return conn


def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = _connect()
    return _conn


def _save() -> None:
    try:
        with _lock:
            conn = _db()
            conn.execute("DELETE FROM schedules")
            conn.executemany(
                "INSERT INTO schedules (id, data) VALUES (?, ?)",
                [(sid, json.dumps(s)) for sid, s in schedules.items()],
            )
            conn.commit()
    except Exception:
        log.exception("write schedules")


def load() -> None:
    global schedules
    try:
        with _lock:
            rows = _db().execute("SELECT id, data FROM schedules").fetchall()
        schedules = {r["id"]: json.loads(r["data"] or "{}") for r in rows}
    except Exception:
        log.exception("read schedules")
        schedules = {}


def cadence_label(cadence: str) -> str:
    return {"hourly": "Every hour", "daily": "Every day", "weekly": "Every week"}.get(cadence, cadence)


def create(name: str, goal: str, cadence: str, entity: str = "") -> dict:
    cadence = cadence if cadence in CADENCE_SECONDS else "weekly"
    sid = uuid.uuid4().hex[:10]
    now = time.time()
    sch = {
        "id": sid,
        "name": name or "Recurring S&OP run",
        "goal": goal,
        "cadence": cadence,
        "entity": entity,
        "enabled": True,
        "created_at": now,
        "next_run": now + CADENCE_SECONDS[cadence],
        "last_run": None,
        "last_session_id": "",
        "run_count": 0,
    }
    schedules[sid] = sch
    _save()
    return sch


def update(sid: str, enabled: bool | None = None) -> dict | None:
    sch = schedules.get(sid)
    if sch is None:
        return None
    if enabled is not None:
        sch["enabled"] = bool(enabled)
    _save()
    return sch


def delete(sid: str) -> bool:
    if sid in schedules:
        del schedules[sid]
        _save()
        return True
    return False


def due(now: float | None = None) -> list[dict]:
    now = now or time.time()
    return [s for s in schedules.values() if s.get("enabled") and now >= s.get("next_run", 0)]


def mark_ran(sid: str, session_id: str, now: float | None = None) -> None:
    sch = schedules.get(sid)
    if sch is None:
        return
    now = now or time.time()
    sch["last_run"] = now
    sch["last_session_id"] = session_id
    sch["run_count"] = sch.get("run_count", 0) + 1
    sch["next_run"] = now + CADENCE_SECONDS.get(sch.get("cadence", "weekly"), 604800)
    _save()


def force_due(sid: str) -> dict | None:
    """Make a schedule due now ('Run now')."""
    sch = schedules.get(sid)
    if sch is None:
        return None
    sch["next_run"] = time.time()
    sch["enabled"] = True
    _save()
    return sch
