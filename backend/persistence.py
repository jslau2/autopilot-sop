from __future__ import annotations

"""
Persistence shim for terminal (completed / terminated) sessions.

Archived runs now live in SQLite via `session_store` (lazy-loaded on demand),
not as per-run JSON files loaded en masse at startup. These helpers are kept as
the stable entry points used elsewhere (e.g. SessionState.done()).
"""

from session import SessionState
import session_store


def save_session(session: SessionState) -> None:
    """Archive a terminal session to the SQLite store."""
    session_store.save(session)


def delete_session_file(session_id: str) -> None:
    """Hard-delete an archived session from the store."""
    session_store.delete(session_id)


def load_sessions() -> dict[str, SessionState]:
    """Deprecated: archived runs are no longer bulk-loaded into memory at
    startup (they're hydrated lazily). Kept for backward compatibility."""
    return {}
