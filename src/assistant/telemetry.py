"""Token estimation and benchmark telemetry helpers.

Provider usage is not reliably exposed by the OpenCode v2.1.4 stream, so the
benchmark always records a local estimate alongside any provider numbers. The
estimate is labelled and is never presented as a complete token denominator.
"""
from __future__ import annotations

from typing import Any


def estimate_tokens(text: str | None) -> dict[str, Any]:
    """Return a labelled token estimate for a prompt or response string."""
    if not text:
        return {"count": 0, "method": "empty"}
    try:  # optional dependency, used by the benchmark extra
        import tiktoken

        encoding = tiktoken.get_encoding("o200k_base")
        return {"count": len(encoding.encode(text)), "method": "o200k_base"}
    except Exception:
        return {"count": max(1, len(text) // 4), "method": "chars/4"}


def call_record(*, mode: str, clock: str, route: str, model: str, wall: float,
                calls: int, outcome: str, prompt: str = "", response: str = "",
                provider_tokens: dict | None = None, reasoning_tokens: int | None = None,
                blockers: list | None = None, advisories: list | None = None,
                judge_model: str | None = None, extra: dict | None = None) -> dict:
    """Build one benchmark row. Lesson-level values are supplied by the driver."""
    prompt_estimate = estimate_tokens(prompt)
    response_estimate = estimate_tokens(response)
    record = {
        "mode": mode,
        "clock": clock,
        "route": route,
        "model": model,
        "wall_s": round(float(wall), 2),
        "calls": int(calls),
        "outcome": outcome,
        "provider_tokens": provider_tokens,
        "reasoning_tokens": reasoning_tokens,
        "tokenizer_est": {
            "in": prompt_estimate,
            "out": response_estimate,
            "label": "prompt + visible output estimate; not a complete denominator",
        },
        "blockers": list(blockers or []),
        "advisories": list(advisories or []),
        "judge_model": judge_model,
    }
    if extra:
        record.update(extra)
    return record
