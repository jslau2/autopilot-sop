from __future__ import annotations

"""
Alerts & notifications. Derives actionable alerts from live session state
(a run paused for a decision, a KPI breaching threshold) and optionally relays
them to a webhook (Slack/Teams/email-relay) — best-effort, stdlib only.
"""

import json
import logging
import threading
import time
import urllib.request
from pathlib import Path

log = logging.getLogger("notifications")

CONFIG_FILE = Path(__file__).parent / "notify_config.json"

# KPI thresholds for "breach" alerts.
OTIF_TARGET = 96.0       # % — below this is a warning
CAPACITY_CRITICAL = 95.0  # % — above this is a warning


def _num(v) -> float | None:
    try:
        return float(str(v).replace("%", "").replace(",", "").replace("$", "").strip())
    except (ValueError, TypeError):
        return None


def compute_alerts(sessions: dict) -> list[dict]:
    """Derive the current set of alerts across all sessions."""
    alerts: list[dict] = []
    for s in sessions.values():
        name = s.name or s.session_id[:8]
        if s.status == "paused" and s.pending_question:
            alerts.append({
                "id": f"{s.session_id}:decision",
                "session_id": s.session_id, "session_name": name,
                "type": "decision", "severity": "action",
                "message": f"“{name}” is paused and needs a decision.",
            })
        # KPI breaches only meaningful once values exist.
        otif = _num(s.kpis.get("otif"))
        if otif is not None and otif < OTIF_TARGET:
            alerts.append({
                "id": f"{s.session_id}:otif",
                "session_id": s.session_id, "session_name": name,
                "type": "kpi", "severity": "warning",
                "message": f"“{name}” OTIF {otif:.1f}% is below the {OTIF_TARGET:.0f}% target.",
            })
        cap = _num(s.kpis.get("capacityUtil"))
        if cap is not None and cap >= CAPACITY_CRITICAL:
            alerts.append({
                "id": f"{s.session_id}:capacity",
                "session_id": s.session_id, "session_name": name,
                "type": "kpi", "severity": "warning",
                "message": f"“{name}” capacity utilisation {cap:.0f}% is critical (≥{CAPACITY_CRITICAL:.0f}%).",
            })
    return alerts


# --- webhook config -------------------------------------------------------
def get_config() -> dict:
    try:
        if CONFIG_FILE.exists():
            return json.loads(CONFIG_FILE.read_text())
    except Exception:
        log.exception("read notify config")
    return {"webhook_url": "", "enabled": False}


def set_config(webhook_url: str | None, enabled: bool | None) -> dict:
    cfg = get_config()
    if webhook_url is not None:
        cfg["webhook_url"] = webhook_url.strip()
    if enabled is not None:
        cfg["enabled"] = bool(enabled)
    try:
        CONFIG_FILE.write_text(json.dumps(cfg))
    except Exception:
        log.exception("write notify config")
    return cfg


def dispatch_webhook(text: str) -> dict:
    """POST a simple JSON payload to the configured webhook. Best-effort."""
    cfg = get_config()
    url = cfg.get("webhook_url", "")
    if not url:
        return {"sent": False, "reason": "no webhook configured"}

    def _post():
        try:
            data = json.dumps({"text": text}).encode()
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=5)
        except Exception as exc:
            log.warning("webhook post failed: %s", exc)

    threading.Thread(target=_post, daemon=True).start()
    return {"sent": True, "url_host": url.split("/")[2] if "//" in url else url[:24], "ts": time.time()}
