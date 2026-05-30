from __future__ import annotations

"""
Central audit log for every LLM API call across the whole system — so an admin
can monitor total token usage and cost fleet-wide (not just per run).

Every call should go through `audited_create()`, which wraps the OpenAI
`chat.completions.create`, records token usage + estimated cost, optionally rolls
it into the owning session, and returns the response. State is persisted so the
running totals survive a restart.
"""

import json
import logging
import os
import threading
import time
from pathlib import Path

log = logging.getLogger("llm_audit")

AUDIT_FILE = Path(__file__).parent / "llm_audit.json"
_RECENT_CAP = 500

# Price per 1M tokens (USD). Override with AZURE_PRICE_INPUT / AZURE_PRICE_OUTPUT.
PRICE_INPUT_PER_M = float(os.getenv("AZURE_PRICE_INPUT", "0.05"))
PRICE_OUTPUT_PER_M = float(os.getenv("AZURE_PRICE_OUTPUT", "0.40"))

_lock = threading.Lock()
_state: dict = {
    "totals": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "calls": 0, "errors": 0, "cost_usd": 0.0},
    "by_agent": {},     # agent -> {calls, total_tokens, cost_usd}
    "by_session": {},   # session_id -> {name, calls, total_tokens, cost_usd}
    "recent": [],       # last N call records (newest last)
}


def cost_of(prompt: int, completion: int) -> float:
    return prompt / 1_000_000 * PRICE_INPUT_PER_M + completion / 1_000_000 * PRICE_OUTPUT_PER_M


def load() -> None:
    global _state
    try:
        if AUDIT_FILE.exists():
            data = json.loads(AUDIT_FILE.read_text())
            if isinstance(data, dict) and "totals" in data:
                _state = data
    except Exception:
        log.exception("read llm audit")


def _save() -> None:
    try:
        tmp = AUDIT_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(_state))
        tmp.replace(AUDIT_FILE)
    except Exception:
        log.exception("write llm audit")


def record(*, session_id: str = "", session_name: str = "", agent: str = "",
           model: str = "", prompt: int = 0, completion: int = 0,
           ok: bool = True, error: str = "") -> None:
    total = prompt + completion
    cost = cost_of(prompt, completion)
    entry = {
        "ts": time.time(),
        "session_id": session_id,
        "session_name": session_name,
        "agent": agent or "—",
        "model": model,
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total,
        "cost_usd": round(cost, 6),
        "ok": ok,
        "error": (error or "")[:200],
    }
    with _lock:
        t = _state["totals"]
        t["prompt_tokens"] += prompt
        t["completion_tokens"] += completion
        t["total_tokens"] += total
        t["calls"] += 1
        t["cost_usd"] = round(t["cost_usd"] + cost, 6)
        if not ok:
            t["errors"] += 1

        a = _state["by_agent"].setdefault(entry["agent"], {"calls": 0, "total_tokens": 0, "cost_usd": 0.0})
        a["calls"] += 1
        a["total_tokens"] += total
        a["cost_usd"] = round(a["cost_usd"] + cost, 6)

        if session_id:
            s = _state["by_session"].setdefault(session_id, {"name": session_name, "calls": 0, "total_tokens": 0, "cost_usd": 0.0})
            s["name"] = session_name or s.get("name", "")
            s["calls"] += 1
            s["total_tokens"] += total
            s["cost_usd"] = round(s["cost_usd"] + cost, 6)

        _state["recent"].append(entry)
        if len(_state["recent"]) > _RECENT_CAP:
            _state["recent"] = _state["recent"][-_RECENT_CAP:]
        _save()


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
        by_agent = [{"agent": k, **v} for k, v in _state["by_agent"].items()]
        by_agent.sort(key=lambda x: x["total_tokens"], reverse=True)
        by_session = [{"session_id": k, **v} for k, v in _state["by_session"].items()]
        by_session.sort(key=lambda x: x["total_tokens"], reverse=True)
        return {
            "totals": {**_state["totals"], "price_input_per_m": PRICE_INPUT_PER_M, "price_output_per_m": PRICE_OUTPUT_PER_M},
            "by_agent": by_agent,
            "by_session": by_session[:50],
            "recent": list(reversed(_state["recent"]))[:recent_limit],
        }
