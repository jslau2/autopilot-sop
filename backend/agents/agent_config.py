from __future__ import annotations

"""
Per-agent runtime config overrides (system prompt, temperature) edited from the
Agent Settings page. Persisted to the shared backend/app.db (gitignored) so they
survive restarts. The orchestrator and workers read the *effective* values.

The in-memory `_overrides` dict is the source of truth at runtime; `_save()`
mirrors it into the `agent_overrides` table.
"""

import json
import logging
import sqlite3
import threading
from pathlib import Path

from .agent_defs import AGENT_DEFS

log = logging.getLogger("agent_config")
DB_FILE = Path(__file__).parent.parent / "app.db"

# Per-agent default sampling temperature (matches historical hardcoded values).
_DEFAULT_TEMPS: dict[str, float] = {"planner": 0.3}
_FALLBACK_TEMP = 0.2

_overrides: dict[str, dict] = {}

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS agent_overrides (agent_id TEXT PRIMARY KEY, data TEXT DEFAULT '{}')"
    )
    conn.commit()
    return conn


def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = _connect()
    return _conn


def _load() -> None:
    global _overrides
    try:
        with _lock:
            rows = _db().execute("SELECT agent_id, data FROM agent_overrides").fetchall()
        _overrides = {r["agent_id"]: json.loads(r["data"] or "{}") for r in rows}
    except Exception:
        log.exception("Failed to load agent overrides")
        _overrides = {}


def _save() -> None:
    try:
        with _lock:
            conn = _db()
            conn.execute("DELETE FROM agent_overrides")
            conn.executemany(
                "INSERT INTO agent_overrides (agent_id, data) VALUES (?, ?)",
                [(aid, json.dumps(o)) for aid, o in _overrides.items()],
            )
            conn.commit()
    except Exception:
        log.exception("Failed to save agent overrides")


_load()


def _default_temp(agent_id: str) -> float:
    return _DEFAULT_TEMPS.get(agent_id, _FALLBACK_TEMP)


def effective_system_prompt(agent_id: str) -> str:
    o = _overrides.get(agent_id, {})
    if o.get("system_prompt"):
        return o["system_prompt"]
    return AGENT_DEFS.get(agent_id, {}).get("system_prompt", "")


def effective_temperature(agent_id: str) -> float:
    o = _overrides.get(agent_id, {})
    t = o.get("temperature")
    return float(t) if isinstance(t, (int, float)) else _default_temp(agent_id)


def effective_enabled(agent_id: str) -> bool:
    """Whether an agent is turned on. Defaults to True; the planner is never
    disable-able (it is the orchestrator itself)."""
    if agent_id == "planner":
        return True
    o = _overrides.get(agent_id, {})
    return bool(o.get("enabled", True))


def enabled_specialists() -> list[str]:
    """Enabled specialist agent ids (everything except the planner), in the
    canonical AGENT_DEFS order."""
    return [a for a in AGENT_DEFS if a != "planner" and effective_enabled(a)]


def get_config(agent_id: str) -> dict | None:
    d = AGENT_DEFS.get(agent_id)
    if not d:
        return None
    o = _overrides.get(agent_id, {})
    return {
        "id": agent_id,
        "name": d.get("name"),
        "data_source": d.get("data_source", ""),
        "phase": d.get("phase"),
        "tools": [t.get("function", t).get("name") for t in d.get("tools", [])],
        "system_prompt": effective_system_prompt(agent_id),
        "default_system_prompt": d.get("system_prompt", ""),
        "temperature": effective_temperature(agent_id),
        "default_temperature": _default_temp(agent_id),
        "enabled": effective_enabled(agent_id),
        "can_disable": agent_id != "planner",
        "overridden": bool(o),
    }


def list_configs() -> list[dict]:
    return [get_config(a) for a in AGENT_DEFS]


def set_config(
    agent_id: str,
    system_prompt: str | None = None,
    temperature: float | None = None,
    enabled: bool | None = None,
) -> dict | None:
    if agent_id not in AGENT_DEFS:
        return None
    o = _overrides.setdefault(agent_id, {})
    if enabled is not None and agent_id != "planner":
        # Only persist the override when it differs from the default (enabled).
        if enabled:
            o.pop("enabled", None)
        else:
            o["enabled"] = False
    if system_prompt is not None:
        sp = system_prompt.strip()
        default_sp = AGENT_DEFS[agent_id].get("system_prompt", "").strip()
        if sp and sp != default_sp:
            o["system_prompt"] = sp
        else:
            o.pop("system_prompt", None)  # equal to default → not an override
    if temperature is not None:
        try:
            t = float(temperature)
        except (TypeError, ValueError):
            t = None
        if t is not None and 0.0 <= t <= 2.0 and abs(t - _default_temp(agent_id)) > 1e-9:
            o["temperature"] = t
        else:
            o.pop("temperature", None)
    if not o:
        _overrides.pop(agent_id, None)
    _save()
    return get_config(agent_id)


def reset_config(agent_id: str) -> dict | None:
    _overrides.pop(agent_id, None)
    _save()
    return get_config(agent_id)
