import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from assistant.visual.beat_factory import BEAT_BRIEFS  # noqa: E402
from assistant.visual.visual_beat_factory import (  # noqa: E402
    build_chapter, fill_defaults, spec_findings,
)


def comparison_spec():
    return {
        "nodes": [
            {"id": "sigmoid", "title": "Sigmoid", "body": "Compresses any score into a smooth S-curve, making outputs readable as probabilities.", "tag": "0 → 1 | σ(z)", "icon": "scale", "color": "blue", "at": 0},
            {"id": "relu", "title": "ReLU", "body": "Clips negative scores to zero and passes positives unchanged, creating a hinge.", "tag": "0 → ∞ | max(0, z)", "icon": "zap", "color": "green", "at": 4},
            {"id": "linear", "title": "Linear", "body": "Returns the score unchanged, so outputs grow without limit along a straight line.", "tag": "unbounded | y = z", "icon": "route", "color": "gold", "at": 8},
        ],
        "connections": [],
        "takeaway": "The activation decides the shape of the output, not the input.",
    }


def test_visual_comparison_builds_the_existing_card_shape():
    brief = next(item for item in BEAT_BRIEFS if item["teaching"] == "comparison")
    spec = comparison_spec()
    assert spec_findings(spec, brief) == []
    chapter = build_chapter(brief, spec)
    assert chapter["teaching"] == "comparison"
    assert chapter["visual"]["layout"] == "comparison"
    assert len(chapter["visual"]["nodes"]) == 3
    assert chapter["visual"]["nodes"][0]["icon"] == "scale"
    assert chapter["visual"]["takeaway"] == spec["takeaway"]


def test_visual_schema_rejects_summary_nodes_and_fills_defaults():
    brief = next(item for item in BEAT_BRIEFS if item["teaching"] == "comparison")
    spec = comparison_spec()
    spec["nodes"][0]["body"] = "Bounded."
    spec["nodes"][0]["icon"] = ""
    spec["nodes"][0]["color"] = ""
    fill_defaults(spec)
    codes = {finding["code"] for finding in spec_findings(spec, brief)}
    assert "short_body" in codes
    assert spec["nodes"][0]["icon"] in {"zap", "scale", "route", "cpu", "eye"}
    assert spec["nodes"][0]["color"] in {"blue", "gold", "green", "coral", "purple"}
