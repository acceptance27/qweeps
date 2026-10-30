"""Pedagogical structure, visual design, and timeline verification for the ALU lesson."""
import json
from pathlib import Path
import pytest
from assistant.skills.visual import VisualExplainerSkill

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "visual-studio/public/lessons/alu.json"
MANIFEST = json.loads(MANIFEST_PATH.read_text())

def test_alu_manifest_follows_visual_design_contract():
    assert MANIFEST["id"] == "alu"
    vd = MANIFEST["visual_design"]
    assert "mechanism" in vd["family"]
    assert "why" in vd and len(vd["why"]) > 20
    assert "encodings" in vd and "Cyan" in vd["encodings"]
    assert "misreading" in vd and "safeguard" in vd
    assert len(MANIFEST["sources"]) >= 2
    assert len(MANIFEST["chapters"]) == 5

def test_alu_chapter_timeline_is_contiguous():
    end = 0.0
    for ch in MANIFEST["chapters"]:
        assert ch["start"] == pytest.approx(end, abs=0.01)
        assert len(ch["cues"]) == 3
        assert ch["cues"][0]["at"] == ch["narrationAt"]
        assert len(ch["roles"]) >= 3
        assert "visual_test" in ch
        end = ch["end"]
    assert end == pytest.approx(MANIFEST["duration"], abs=0.01)

def test_alu_skill_matches_make_a_lesson():
    skill = VisualExplainerSkill()
    matched = skill.match("make a lesson")
    assert matched is not None
    assert matched["action"] == "launch"
    assert matched["topic"] == "alu"

    matched_interactive = skill.match("make an interactive lesson on ALU")
    assert matched_interactive is not None
    assert matched_interactive["action"] == "launch"
    assert matched_interactive["topic"] == "alu"
