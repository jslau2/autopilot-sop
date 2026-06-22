"""
Session-scoped hand-off between engine-backed tools within one S&OP run.

This is the plumbing for the forecast -> optimizer chain: the Demand agent's
projected demand (booking-curve) becomes the demand vector the optimizer
(fg-planning-optimizer) consumes.

Tool functions in `workers.TOOL_DISPATCH` only receive their JSON args, not the
session. So `workers._execute_tool` binds the active session here (per worker
thread) for the duration of one tool call, and the engine clients read/write a
demand signal on that session. Binding is thread-local because concurrent
specialist agents each run their tool call on a separate executor thread.
"""

from __future__ import annotations

import threading
from typing import Any

_local = threading.local()


def bind_session(session: Any) -> None:
    """Bind the session active for the current tool call (this thread)."""
    _local.session = session


def active_session() -> Any | None:
    return getattr(_local, "session", None)


def put_demand_signal(signal: dict) -> None:
    """Stash the demand signal produced by the Demand agent on the session."""
    s = active_session()
    if s is not None:
        setattr(s, "engine_demand_signal", signal)


def get_demand_signal() -> dict | None:
    """The demand signal for the current run, if the Demand agent produced one."""
    s = active_session()
    if s is None:
        return None
    return getattr(s, "engine_demand_signal", None)
