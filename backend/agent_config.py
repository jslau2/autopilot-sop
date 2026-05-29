from __future__ import annotations

"""
Per-agent runtime config overrides (system prompt, temperature) edited from the
Agent Settings page. Persisted to agent_overrides.json (gitignored) so they
survive restarts. The orchestrator and workers read the *effective* values.
"""

import json
import logging
from pathlib import Path

from agent_defs import AGENT_DEFS

log = logging.getLogger("agent_config")
_PATH = Path(__file__).parent / "agent_overrides.json"

# Per-agent default sampling temperature (matches historical hardcoded values).
_DEFAULT_TEMPS: dict[str, float] = {"planner": 0.3}
_FALLBACK_TEMP = 0.2

_overrides: dict[str, dict] = {}


def _load() -> None:
    global _overrides
    try:
        if _PATH.exists():
            _overrides = json.loads(_PATH.read_text())
    except Exception:
        log.exception("Failed to load agent overrides")
        _overrides = {}


def _save() -> None:
    try:
        _PATH.write_text(json.dumps(_overrides, indent=2))
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


def get_config(agent_id: str) -> dict | None:
    d = AGENT_DEFS.get(agent_id)
    if not d:
        return None
    o = _overrides.get(agent_id, {})
    return {
        "id": agent_id,
        "name": d.get("name"),
        "data_source": d.get("data_source", ""),
        "tools": [t.get("function", t).get("name") for t in d.get("tools", [])],
        "system_prompt": effective_system_prompt(agent_id),
        "default_system_prompt": d.get("system_prompt", ""),
        "temperature": effective_temperature(agent_id),
        "default_temperature": _default_temp(agent_id),
        "overridden": bool(o),
    }


def list_configs() -> list[dict]:
    return [get_config(a) for a in AGENT_DEFS]


def set_config(agent_id: str, system_prompt: str | None = None, temperature: float | None = None) -> dict | None:
    if agent_id not in AGENT_DEFS:
        return None
    o = _overrides.setdefault(agent_id, {})
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
