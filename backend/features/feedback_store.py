from __future__ import annotations

"""
Lightweight append-only store for in-app user feedback (👍 / 👎 + comment) on
agent outputs and whole runs. Feeds the Agent Manager governance analytics.

Persisted as a single JSON array in backend/feedback.json (gitignored).
"""

import json
import logging
import time
import uuid
from pathlib import Path

log = logging.getLogger("feedback")

FEEDBACK_FILE = Path(__file__).parent.parent / "feedback.json"


def _load() -> list[dict]:
    try:
        if FEEDBACK_FILE.exists():
            data = json.loads(FEEDBACK_FILE.read_text())
            if isinstance(data, list):
                return data
    except Exception:
        log.exception("Failed to read feedback store")
    return []


def _save(items: list[dict]) -> None:
    try:
        tmp = FEEDBACK_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(items))
        tmp.replace(FEEDBACK_FILE)
    except Exception:
        log.exception("Failed to write feedback store")


def record(entry: dict) -> dict:
    """Append a feedback entry, stamping id + timestamp. Returns the stored row."""
    items = _load()
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
    items.append(row)
    _save(items)
    return row


def list_feedback(session_id: str = "") -> list[dict]:
    items = _load()
    if session_id:
        items = [r for r in items if r.get("session_id") == session_id]
    return sorted(items, key=lambda r: r.get("ts", 0), reverse=True)


def summary() -> dict:
    """Aggregate counts for governance analytics."""
    items = _load()
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
        for r in sorted(items, key=lambda r: r.get("ts", 0), reverse=True)
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
