"""Shared helpers for the engine clients: config from env + a sync HTTP client.

The clients are called from inside `workers._execute_tool`, which the worker
loop offloads to a thread (`run_in_executor`) — so blocking HTTP and poll loops
here never stall the event loop, and a plain synchronous `httpx.Client` is the
right tool.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# Default per-request timeout (seconds). A MILP solve is polled separately with
# its own ceiling; this guards individual HTTP calls.
DEFAULT_TIMEOUT = 30.0


def base_url(*env_names: str) -> str | None:
    """First non-empty env var among env_names, trimmed of trailing slashes."""
    for name in env_names:
        val = os.environ.get(name)
        if val and val.strip():
            return val.strip().rstrip("/")
    return None


def client(timeout: float = DEFAULT_TIMEOUT):
    """A synchronous httpx client, or None if httpx isn't installed."""
    try:
        import httpx
    except ImportError:  # pragma: no cover — httpx is a declared dep
        logger.warning("httpx not installed; engine clients will use mock data.")
        return None
    return httpx.Client(timeout=timeout)
