import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from assistant.visual.handart import validate_artwork  # noqa: E402


def valid_art():
    return [
        {"type": "path", "d": "M8 50 Q18 30 28 50 T48 50 T68 50 T88 50", "stroke": "gold", "fill": "none", "strokeWidth": 2.4},
        {"type": "line", "x1": 12, "y1": 72, "x2": 84, "y2": 72, "stroke": "gold", "fill": "none", "strokeWidth": 2},
        {"type": "text", "x": 50, "y": 92, "size": 8, "text": "E = hν", "stroke": "none", "fill": "muted", "strokeWidth": 1},
    ]


def test_valid_handcrafted_art_passes():
    assert validate_artwork(valid_art()) == []


def test_path_commands_and_bounds_are_enforced():
    art = valid_art()
    art[0]["d"] = "M8 50 A20 20 0 0 0 88 50"
    assert validate_artwork(art)
    art[0]["d"] = "M8 50 Q18 -10 28 50"
    assert validate_artwork(art)


def test_text_and_palette_are_bounded():
    art = valid_art()
    art[2]["text"] = "x" * 41
    assert validate_artwork(art)
    art = valid_art()
    art[1]["stroke"] = "url(http://evil)"
    assert validate_artwork(art)
