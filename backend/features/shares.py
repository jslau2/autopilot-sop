from __future__ import annotations

"""
Shareable read-only links for a run / its report. A short token maps to a
session_id; the mapping is persisted so links survive a restart (for archived
runs). The shared payload is a read-only snapshot — no controls, no live stream.
"""

import json
import logging
import secrets
from pathlib import Path

log = logging.getLogger("shares")

SHARES_FILE = Path(__file__).parent.parent / "shares.json"


def _load() -> dict:
    try:
        if SHARES_FILE.exists():
            return json.loads(SHARES_FILE.read_text())
    except Exception:
        log.exception("read shares")
    return {}


def _save(d: dict) -> None:
    try:
        SHARES_FILE.write_text(json.dumps(d))
    except Exception:
        log.exception("write shares")


def create_token(session_id: str) -> str:
    """Return an existing token for the session, or mint a new one."""
    d = _load()
    for tok, sid in d.items():
        if sid == session_id:
            return tok
    tok = secrets.token_urlsafe(9)
    d[tok] = session_id
    _save(d)
    return tok


def resolve(token: str) -> str | None:
    return _load().get(token)
