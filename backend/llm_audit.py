from __future__ import annotations

"""
Central audit log for every LLM API call — SQLite-backed so it scales.

Design:
- One row per call in `calls` (append = O(1)); indexed by ts / agent / session.
- Lifetime cumulative counters in `lifetime` survive row pruning, so the admin
  "total tokens / cost" stays accurate forever even as raw rows are trimmed.
- Retention: raw `calls` rows older than LLM_AUDIT_RETENTION_DAYS are pruned
  opportunistically (not on every insert). Set to 0 to keep everything.

Every call should go through `audited_create()`, which wraps the OpenAI
`chat.completions.create`, records token usage + estimated cost, optionally
rolls it into the owning session, and returns the response.
"""

import json
import logging
import os
import sqlite3
import threading
import time
from pathlib import Path

log = logging.getLogger("llm_audit")

DB_FILE = Path(__file__).parent / "llm_audit.db"
JSON_LEGACY = Path(__file__).parent / "llm_audit.json"

# Price per 1M tokens (USD). Override with AZURE_PRICE_INPUT / AZURE_PRICE_OUTPUT.
PRICE_INPUT_PER_M = float(os.getenv("AZURE_PRICE_INPUT", "0.05"))
PRICE_OUTPUT_PER_M = float(os.getenv("AZURE_PRICE_OUTPUT", "0.40"))

# Raw-row retention. Lifetime totals are never lost; only the per-call rows
# (used for breakdowns + the recent trail) are trimmed beyond this window.
RETENTION_DAYS = int(os.getenv("LLM_AUDIT_RETENTION_DAYS", "90"))

_LIFETIME_KEYS = ("prompt_tokens", "completion_tokens", "total_tokens", "calls", "errors", "cost_usd")

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None
_inserts_since_prune = 0
_last_prune = 0.0


def cost_of(prompt: int, completion: int) -> float:
    return prompt / 1_000_000 * PRICE_INPUT_PER_M + completion / 1_000_000 * PRICE_OUTPUT_PER_M


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    fresh = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='calls'"
    ).fetchone() is None
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts REAL NOT NULL,
            session_id TEXT DEFAULT '',
            session_name TEXT DEFAULT '',
            agent TEXT DEFAULT '',
            model TEXT DEFAULT '',
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            cost_usd REAL DEFAULT 0,
            ok INTEGER DEFAULT 1,
            error TEXT DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_calls_ts ON calls(ts);
        CREATE INDEX IF NOT EXISTS idx_calls_agent ON calls(agent);
        CREATE INDEX IF NOT EXISTS idx_calls_session ON calls(session_id);
        CREATE TABLE IF NOT EXISTS lifetime (k TEXT PRIMARY KEY, v REAL DEFAULT 0);
        """
    )
    for k in _LIFETIME_KEYS:
        conn.execute("INSERT OR IGNORE INTO lifetime(k, v) VALUES(?, 0)", (k,))
    conn.commit()
    if fresh:
        _migrate_legacy_json(conn)
    return conn


def _migrate_legacy_json(conn: sqlite3.Connection) -> None:
    """One-time: fold an old llm_audit.json into the DB so history isn't lost."""
    if not JSON_LEGACY.exists():
        return
    try:
        data = json.loads(JSON_LEGACY.read_text())
    except Exception:
        return
    t = data.get("totals", {})
    for k in _LIFETIME_KEYS:
        conn.execute("UPDATE lifetime SET v = v + ? WHERE k=?", (float(t.get(k, 0) or 0), k))
    for e in data.get("recent", []):
        conn.execute(
            "INSERT INTO calls(ts,session_id,session_name,agent,model,prompt_tokens,completion_tokens,total_tokens,cost_usd,ok,error)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (e.get("ts", time.time()), e.get("session_id", ""), e.get("session_name", ""),
             e.get("agent", ""), e.get("model", ""), e.get("prompt_tokens", 0),
             e.get("completion_tokens", 0), e.get("total_tokens", 0), e.get("cost_usd", 0),
             1 if e.get("ok", True) else 0, e.get("error", "")),
        )
    conn.commit()
    try:
        JSON_LEGACY.rename(JSON_LEGACY.with_suffix(".json.migrated"))
    except Exception:
        pass
    log.info("Migrated legacy llm_audit.json into SQLite")


def load() -> None:
    """Initialise the DB connection (idempotent). Called once at startup."""
    global _conn
    with _lock:
        if _conn is None:
            _conn = _connect()


def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = _connect()
    return _conn


def _maybe_prune(conn: sqlite3.Connection) -> None:
    """Trim old raw rows, but not on every insert (avoids write amplification)."""
    global _inserts_since_prune, _last_prune
    if RETENTION_DAYS <= 0:
        return
    now = time.time()
    if _inserts_since_prune < 200 and (now - _last_prune) < 3600:
        return
    cutoff = now - RETENTION_DAYS * 86400
    conn.execute("DELETE FROM calls WHERE ts < ?", (cutoff,))
    conn.commit()
    _inserts_since_prune = 0
    _last_prune = now


def record(*, session_id: str = "", session_name: str = "", agent: str = "",
           model: str = "", prompt: int = 0, completion: int = 0,
           ok: bool = True, error: str = "") -> None:
    global _inserts_since_prune
    total = int(prompt) + int(completion)
    cost = cost_of(prompt, completion)
    with _lock:
        conn = _db()
        conn.execute(
            "INSERT INTO calls(ts,session_id,session_name,agent,model,prompt_tokens,completion_tokens,total_tokens,cost_usd,ok,error)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (time.time(), session_id, session_name, agent or "—", model,
             int(prompt), int(completion), total, cost, 1 if ok else 0, (error or "")[:200]),
        )
        conn.execute("UPDATE lifetime SET v = v + ? WHERE k='prompt_tokens'", (int(prompt),))
        conn.execute("UPDATE lifetime SET v = v + ? WHERE k='completion_tokens'", (int(completion),))
        conn.execute("UPDATE lifetime SET v = v + ? WHERE k='total_tokens'", (total,))
        conn.execute("UPDATE lifetime SET v = v + 1 WHERE k='calls'")
        if not ok:
            conn.execute("UPDATE lifetime SET v = v + 1 WHERE k='errors'")
        conn.execute("UPDATE lifetime SET v = v + ? WHERE k='cost_usd'", (cost,))
        conn.commit()
        _inserts_since_prune += 1
        _maybe_prune(conn)


def audited_create(client, *, agent: str = "", model: str = "",
                   session=None, session_id: str = "", session_name: str = "",
                   **create_kwargs):
    """
    Wrap client.chat.completions.create(...): record usage/cost to the audit log
    (and into the session if given), then return the response. Records an error
    entry and re-raises on failure.
    """
    sid = session.session_id if session is not None else session_id
    sname = session.name if session is not None else session_name
    try:
        resp = client.chat.completions.create(model=model, **create_kwargs)
    except Exception as exc:
        record(session_id=sid, session_name=sname, agent=agent, model=model, ok=False, error=str(exc))
        raise
    usage = getattr(resp, "usage", None)
    prompt = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion = int(getattr(usage, "completion_tokens", 0) or 0)
    if session is not None:
        session.add_usage(usage)
    record(session_id=sid, session_name=sname, agent=agent, model=model,
           prompt=prompt, completion=completion, ok=True)
    return resp


def summary(recent_limit: int = 100) -> dict:
    with _lock:
        conn = _db()
        life = {r["k"]: r["v"] for r in conn.execute("SELECT k, v FROM lifetime")}
        totals = {
            "prompt_tokens": int(life.get("prompt_tokens", 0)),
            "completion_tokens": int(life.get("completion_tokens", 0)),
            "total_tokens": int(life.get("total_tokens", 0)),
            "calls": int(life.get("calls", 0)),
            "errors": int(life.get("errors", 0)),
            "cost_usd": round(life.get("cost_usd", 0.0), 6),
            "price_input_per_m": PRICE_INPUT_PER_M,
            "price_output_per_m": PRICE_OUTPUT_PER_M,
            "retention_days": RETENTION_DAYS,
            "window_calls": conn.execute("SELECT COUNT(*) c FROM calls").fetchone()["c"],
        }
        by_agent = [
            {"agent": r["agent"], "calls": r["calls"], "total_tokens": r["tok"], "cost_usd": round(r["cost"], 6)}
            for r in conn.execute(
                "SELECT agent, COUNT(*) calls, SUM(total_tokens) tok, SUM(cost_usd) cost"
                " FROM calls GROUP BY agent ORDER BY tok DESC")
        ]
        by_session = [
            {"session_id": r["session_id"], "name": r["name"] or "", "calls": r["calls"],
             "total_tokens": r["tok"], "cost_usd": round(r["cost"], 6)}
            for r in conn.execute(
                "SELECT session_id, MAX(session_name) name, COUNT(*) calls, SUM(total_tokens) tok, SUM(cost_usd) cost"
                " FROM calls WHERE session_id != '' GROUP BY session_id ORDER BY tok DESC LIMIT 50")
        ]
        recent = [
            {"ts": r["ts"], "session_id": r["session_id"], "session_name": r["session_name"],
             "agent": r["agent"], "model": r["model"], "prompt_tokens": r["prompt_tokens"],
             "completion_tokens": r["completion_tokens"], "total_tokens": r["total_tokens"],
             "cost_usd": round(r["cost_usd"], 6), "ok": bool(r["ok"]), "error": r["error"]}
            for r in conn.execute(
                "SELECT * FROM calls ORDER BY id DESC LIMIT ?", (recent_limit,))
        ]
        return {"totals": totals, "by_agent": by_agent, "by_session": by_session, "recent": recent}
