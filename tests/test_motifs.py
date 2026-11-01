import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from assistant.visual.motifs import MOTIFS, expand_motif, validate_motif  # noqa: E402


def test_every_motif_expands_to_safe_primitives():
    samples = {
        "wave": {"type": "wave"},
        "vector": {"type": "vector", "angle": 45},
        "box": {"type": "box", "symbol": "m"},
        "ring": {"type": "ring"},
        "pair": {"type": "pair"},
        "axis": {"type": "axis"},
        "collision": {"type": "collision"},
        "field": {"type": "field"},
        "equation": {"type": "equation", "formula": "E = mc^2"},
    }
    for kind in MOTIFS:
        motif = samples[kind]
        assert validate_motif(motif) is None
        artwork = expand_motif(motif, "blue")
        assert artwork
        assert all(item["type"] in {"path", "line", "circle", "rect", "text"} for item in artwork)


def test_invalid_motif_is_rejected_before_drawing():
    assert validate_motif({"type": "raw-svg"}) is not None
    assert validate_motif({"type": "vector", "angle": 13}) is not None
    assert validate_motif({"type": "wave", "frequency": 9}) is not None
    assert validate_motif(None) is not None
