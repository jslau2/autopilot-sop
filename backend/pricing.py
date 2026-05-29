from __future__ import annotations

"""
Rough Azure OpenAI cost estimation for token tracking.

Rates are USD per 1,000,000 tokens as (input, output). These are approximate
and configurable — override via the AZURE_OPENAI_PRICE_IN / _OUT env vars
(USD per 1M tokens) if your contract differs.
"""

import os

# USD per 1M tokens: model-name substring -> (input, output)
_PRICING: dict[str, tuple[float, float]] = {
    "gpt-4o-mini":   (0.15, 0.60),
    "gpt-4o":        (2.50, 10.00),
    "gpt-4.1-mini":  (0.40, 1.60),
    "gpt-4.1-nano":  (0.10, 0.40),
    "gpt-4.1":       (2.00, 8.00),
    "gpt-4-turbo":   (10.00, 30.00),
    "gpt-4":         (30.00, 60.00),
    "gpt-35-turbo":  (0.50, 1.50),
    "gpt-3.5-turbo": (0.50, 1.50),
    "o1-mini":       (1.10, 4.40),
    "o1":            (15.00, 60.00),
    "o3-mini":       (1.10, 4.40),
    # Generic tier fallbacks (matched by substring when an exact model isn't
    # listed) so e.g. "5.4-nano" lands on cheap nano rates, not gpt-4o.
    # Confirm exact rates via AZURE_OPENAI_PRICE_IN/_OUT for billing accuracy.
    "nano":          (0.10, 0.40),
    "mini":          (0.15, 0.60),
}

_DEFAULT = (2.50, 10.00)  # fall back to gpt-4o-class pricing


def _rates(model: str) -> tuple[float, float]:
    env_in = os.getenv("AZURE_OPENAI_PRICE_IN")
    env_out = os.getenv("AZURE_OPENAI_PRICE_OUT")
    if env_in and env_out:
        try:
            return (float(env_in), float(env_out))
        except ValueError:
            pass
    m = (model or "").lower()
    if m in _PRICING:
        return _PRICING[m]
    # longest substring match wins (so gpt-4o-mini beats gpt-4o)
    for key in sorted(_PRICING, key=len, reverse=True):
        if key in m:
            return _PRICING[key]
    return _DEFAULT


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimated USD cost for one call."""
    inp, out = _rates(model)
    return (prompt_tokens / 1_000_000) * inp + (completion_tokens / 1_000_000) * out
