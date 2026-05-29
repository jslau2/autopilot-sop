from __future__ import annotations

"""
Rough Azure OpenAI cost estimation for token tracking.

Rates are USD per 1,000,000 tokens. Each entry is (input, output, cached_input)
where cached_input is the discounted rate for prompt tokens served from cache.
These are approximate and configurable — override input/output via the
AZURE_OPENAI_PRICE_IN / _OUT env vars (USD per 1M tokens) if your contract differs.
"""

import os

# USD per 1M tokens: model-name substring -> (input, output, cached_input)
_PRICING: dict[str, tuple[float, float, float]] = {
    "gpt-5.4-mini":  (0.75, 4.50, 0.08),
    "gpt-5.4-nano":  (0.20, 1.25, 0.02),
    "5.4-mini":      (0.75, 4.50, 0.08),
    "5.4-nano":      (0.20, 1.25, 0.02),
    "gpt-4o-mini":   (0.15, 0.60, 0.075),
    "gpt-4o":        (2.50, 10.00, 1.25),
    "gpt-4.1-mini":  (0.40, 1.60, 0.10),
    "gpt-4.1-nano":  (0.10, 0.40, 0.025),
    "gpt-4.1":       (2.00, 8.00, 0.50),
    "gpt-4-turbo":   (10.00, 30.00, 10.00),
    "gpt-4":         (30.00, 60.00, 30.00),
    "gpt-35-turbo":  (0.50, 1.50, 0.50),
    "gpt-3.5-turbo": (0.50, 1.50, 0.50),
    "o1-mini":       (1.10, 4.40, 0.55),
    "o1":            (15.00, 60.00, 7.50),
    "o3-mini":       (1.10, 4.40, 0.55),
    # Generic tier fallbacks (substring) for unlisted models.
    "nano":          (0.20, 1.25, 0.02),
    "mini":          (0.75, 4.50, 0.08),
}

_DEFAULT = (2.50, 10.00, 1.25)  # fall back to gpt-4o-class pricing


def _rates(model: str) -> tuple[float, float, float]:
    m = (model or "").lower()
    rates = _PRICING.get(m)
    if rates is None:
        # longest substring match wins (so gpt-5.4-nano beats nano)
        for key in sorted(_PRICING, key=len, reverse=True):
            if key in m:
                rates = _PRICING[key]
                break
    inp, out, cached = rates if rates is not None else _DEFAULT

    # Env overrides take precedence for input/output.
    env_in, env_out = os.getenv("AZURE_OPENAI_PRICE_IN"), os.getenv("AZURE_OPENAI_PRICE_OUT")
    if env_in and env_out:
        try:
            inp, out = float(env_in), float(env_out)
            cached = inp  # no cache assumption when overriding
        except ValueError:
            pass
    return inp, out, cached


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int, cached_tokens: int = 0) -> float:
    """Estimated USD cost for one call. cached_tokens (subset of prompt_tokens)
    are billed at the cheaper cached-input rate."""
    inp, out, cached = _rates(model)
    cached_tokens = max(0, min(cached_tokens, prompt_tokens))
    fresh = prompt_tokens - cached_tokens
    return (
        fresh / 1_000_000 * inp
        + cached_tokens / 1_000_000 * cached
        + completion_tokens / 1_000_000 * out
    )
