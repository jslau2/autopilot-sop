from __future__ import annotations

"""
Alerts & notifications. Derives actionable alerts from live session state
(a run paused for a decision, a KPI breaching threshold) and relays them to any
enabled channel — generic webhook (Slack/Teams), Telegram, and/or email —
best-effort, stdlib only. SMTP server credentials live in backend/.env
(SMTP_HOST/PORT/USER/PASS/FROM); everything else is configured from the UI.
"""

import json
import logging
import os
import smtplib
import sqlite3
import threading
import time
import urllib.parse
import urllib.request
from email.message import EmailMessage
from pathlib import Path

log = logging.getLogger("notifications")

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
        "CREATE TABLE IF NOT EXISTS notify_config (k TEXT PRIMARY KEY, v TEXT DEFAULT '{}')"
    )
    conn.commit()
    return conn


def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = _connect()
    return _conn

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


# --- channel config -------------------------------------------------------
_DEFAULTS = {
    # generic webhook (Slack / Teams incoming webhooks)
    "webhook_url": "",
    "enabled": False,           # legacy name kept = webhook channel toggle
    # telegram bot
    "telegram_bot_token": "",
    "telegram_chat_id": "",
    "telegram_enabled": False,
    # email (recipient in db; SMTP server creds in backend/.env)
    "email_to": "",
    "email_enabled": False,
}


def get_config() -> dict:
    cfg = dict(_DEFAULTS)
    try:
        with _lock:
            r = _db().execute("SELECT v FROM notify_config WHERE k='config'").fetchone()
        if r is not None:
            cfg.update(json.loads(r["v"] or "{}"))
    except Exception:
        log.exception("read notify config")
    return cfg


def set_config(**fields) -> dict:
    """Patch config. Only keys present in ``_DEFAULTS`` (and not None) are saved;
    strings are trimmed, booleans coerced."""
    cfg = get_config()
    for k, v in fields.items():
        if v is None or k not in _DEFAULTS:
            continue
        cfg[k] = v.strip() if isinstance(v, str) else bool(v)
    try:
        with _lock:
            conn = _db()
            conn.execute(
                "INSERT OR REPLACE INTO notify_config (k, v) VALUES ('config', ?)",
                (json.dumps(cfg),),
            )
            conn.commit()
    except Exception:
        log.exception("write notify config")
    return cfg


def public_state(cfg: dict | None = None) -> dict:
    """What the UI is allowed to see — toggles + whether each channel is
    configured, never the secrets themselves."""
    cfg = cfg or get_config()
    smtp_ready = bool(os.environ.get("SMTP_HOST"))
    return {
        # back-compat: top-level enabled/configured = webhook channel
        "enabled": bool(cfg.get("enabled")),
        "configured": bool(cfg.get("webhook_url")),
        "telegram_enabled": bool(cfg.get("telegram_enabled")),
        "telegram_configured": bool(cfg.get("telegram_bot_token") and cfg.get("telegram_chat_id")),
        "email_enabled": bool(cfg.get("email_enabled")),
        "email_configured": bool(cfg.get("email_to") and smtp_ready),
        "smtp_ready": smtp_ready,
    }


# --- per-channel senders (best-effort, run off-thread) ---------------------
def _send_webhook(text: str, cfg: dict) -> dict:
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


def _send_telegram(text: str, cfg: dict) -> dict:
    token = cfg.get("telegram_bot_token", "")
    chat_id = cfg.get("telegram_chat_id", "")
    if not (token and chat_id):
        return {"sent": False, "reason": "telegram not configured"}

    def _post():
        try:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            data = urllib.parse.urlencode({
                "chat_id": chat_id,
                "text": text,
                "disable_web_page_preview": "true",
            }).encode()
            req = urllib.request.Request(url, data=data)
            urllib.request.urlopen(req, timeout=5)
        except Exception as exc:
            log.warning("telegram send failed: %s", exc)

    threading.Thread(target=_post, daemon=True).start()
    return {"sent": True, "chat_id": chat_id, "ts": time.time()}


def _send_email(text: str, cfg: dict) -> dict:
    to = cfg.get("email_to", "")
    host = os.environ.get("SMTP_HOST", "")
    if not to:
        return {"sent": False, "reason": "no recipient configured"}
    if not host:
        return {"sent": False, "reason": "SMTP not configured (set SMTP_HOST in backend/.env)"}

    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    pwd = os.environ.get("SMTP_PASS", "")
    sender = os.environ.get("SMTP_FROM", user or "autopilot-sop@localhost")
    recipients = [a.strip() for a in to.replace(";", ",").split(",") if a.strip()]

    def _post():
        try:
            msg = EmailMessage()
            msg["Subject"] = "Autopilot S&OP alert"
            msg["From"] = sender
            msg["To"] = ", ".join(recipients)
            msg.set_content(text)
            with smtplib.SMTP(host, port, timeout=10) as smtp:
                smtp.ehlo()
                if smtp.has_extn("starttls"):
                    smtp.starttls()
                    smtp.ehlo()
                if user and pwd:
                    smtp.login(user, pwd)
                smtp.send_message(msg)
        except Exception as exc:
            log.warning("email send failed: %s", exc)

    threading.Thread(target=_post, daemon=True).start()
    return {"sent": True, "to": recipients, "ts": time.time()}


def dispatch(text: str, *, force: bool = False) -> dict:
    """Fan a message out to every enabled channel. ``force`` ignores the per-channel
    toggle (used by the 'send test' button so a freshly-saved channel can be tried)."""
    cfg = get_config()
    results: dict[str, dict] = {}
    if force or cfg.get("enabled"):
        results["webhook"] = _send_webhook(text, cfg)
    if force or cfg.get("telegram_enabled"):
        results["telegram"] = _send_telegram(text, cfg)
    if force or cfg.get("email_enabled"):
        results["email"] = _send_email(text, cfg)
    sent = [c for c, r in results.items() if r.get("sent")]
    return {"sent": bool(sent), "channels": results, "reason": None if sent else "no channel enabled/configured"}


# Back-compat alias — older callers used dispatch_webhook(text).
def dispatch_webhook(text: str) -> dict:
    return dispatch(text, force=True)


# --- auto-dispatch of newly-raised alerts ----------------------------------
_dispatched: set[str] = set()
_dispatch_lock = threading.Lock()


def dispatch_new_alerts(alerts: list[dict]) -> None:
    """Push any alert we haven't relayed yet to the enabled channels, once.
    Called from the notifications poll so alerts reach Telegram/email/webhook
    even when nobody has the UI open. Ids that drop off re-arm for next time."""
    cfg = get_config()
    if not (cfg.get("enabled") or cfg.get("telegram_enabled") or cfg.get("email_enabled")):
        # nothing to relay to; still track ids so we don't blast on first enable
        with _dispatch_lock:
            _dispatched.intersection_update({a["id"] for a in alerts})
        return
    with _dispatch_lock:
        active = {a["id"] for a in alerts}
        _dispatched.intersection_update(active)
        fresh = [a for a in alerts if a["id"] not in _dispatched]
        for a in fresh:
            _dispatched.add(a["id"])
    for a in fresh:
        icon = "⏸" if a.get("type") == "decision" else "⚠"
        dispatch(f"{icon} Autopilot S&OP — {a.get('message', '')}")
