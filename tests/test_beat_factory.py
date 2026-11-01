import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from assistant.visual.beat_factory import (  # noqa: E402
    BEAT_BRIEFS, build_program, clip_words, extract_json, prompt_for, spec_findings,
)


def test_extract_json_strips_code_fences():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}


def test_clip_words_keeps_words_whole():
    assert clip_words("deep networks and modern hardware", 24) == "deep networks and…"


def test_prompt_carries_field_budgets():
    brief = next(item for item in BEAT_BRIEFS if item["teaching"] == "narrative")
    prompt = prompt_for(brief)
    assert "caption" in prompt and "32" in prompt


def test_valid_comparison_spec_builds_a_split_scene():
    brief = next(item for item in BEAT_BRIEFS if item["teaching"] == "comparison")
    spec = {
        "cards": [
            {
                "title": "Sigmoid", "badge": "S", "asset": "scale", "formula": "σ(z) = 1 / (1 + e^-z)",
                "value": "0 to 1", "detail": "Smooth, bounded output used for probabilities.",
                "role": "blue",
            },
            {
                "title": "ReLU", "badge": "R", "asset": "zap", "formula": "max(0, z)",
                "value": "0 to infinity", "detail": "Zero for negatives and linear above, which keeps hidden layers sparse and trainable.",
                "role": "green",
            },
            {
                "title": "Linear", "badge": "L", "asset": "route", "formula": "y = z",
                "value": "unbounded", "detail": "Passes the raw score through unchanged, so regression outputs can grow without a bound.",
                "role": "gold",
            },
        ],
        "conclusion": "The activation decides the shape of the output, not the input.",
    }
    assert spec_findings(spec, brief) == []
    program = build_program(brief, spec)
    kinds = [item["kind"] for item in program["objects"]]
    assert kinds.count("comparison-card") == 3
    assert any(action["kind"] == "morph" and action["mode"] == "replace" for action in program["actions"])
    assert sum(1 for action in program["actions"] if action["kind"] == "morph" and action["mode"] == "copy") == 2
    assert any(action["kind"] == "dock" for action in program["actions"])
    assert program["context"]["label"] == "shared input z"


def test_summary_spec_is_rejected_before_compilation():
    brief = next(item for item in BEAT_BRIEFS if item["teaching"] == "comparison")
    spec = {
        "cards": [
            {"title": "Sigmoid", "formula": "", "detail": "bounded"},
            {"title": "ReLU", "formula": "max(0,z)", "detail": "hinge"},
        ],
        "conclusion": "The rule decides.",
    }
    codes = {finding["code"] for finding in spec_findings(spec, brief)}
    assert "missing_formula" in codes
    assert "missing_detail" in codes
    assert "missing_detail" in codes
