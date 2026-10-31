import copy
import json
from pathlib import Path

import pytest

from assistant.visual.hybrid import (
    DIAGRAM,
    check_lesson_geometry,
    compile_hybrid_lesson,
    validate_hybrid_plan,
    _place_diagram,
)
from assistant.visual.plan import PlanError

ROOT = Path(__file__).resolve().parents[1]
ICONS = set(json.loads((ROOT / "visual-studio/public/live/catalog.json").read_text())["icons"])
PLAN = json.loads((ROOT / "tests/fixtures/hybrid_neuron_plan.json").read_text())


def compile_plan(plan=None):
    return compile_hybrid_lesson(plan or PLAN, ICONS)


def test_the_fixture_compiles_into_a_live_lesson():
    lesson = compile_plan()
    assert lesson["kind"] == "live_generated"
    assert len(lesson["chapters"]) == 3
    assert [c["id"] for c in lesson["chapters"]] == ["inputs-weights", "sum-bias", "activation"]
    for chapter in lesson["chapters"]:
        assert chapter["cues"] and chapter["roles"]
        assert chapter["visual"]["layout"] in {"diagram", "process", "fanin"}
        assert 2 <= len(chapter["visual"]["nodes"]) <= 6
    first = lesson["chapters"][0]["visual"]["nodes"]
    assert {node["id"] for node in first} == {"input-x1", "input-x2", "neuron"}
    assert all("position" in node and "artwork" in node for node in first)


def test_every_template_expands_within_the_artwork_budget():
    lesson = compile_plan()
    for chapter in lesson["chapters"]:
        for node in chapter["visual"]["nodes"]:
            artwork = node.get("artwork", [])
            assert len(artwork) <= 8
            assert all(part["type"] in {"path", "circle", "ellipse", "rect", "line", "text"}
                       for part in artwork)
    sigmoid = next(node for node in lesson["chapters"][2]["visual"]["nodes"]
                   if node["id"] == "sigmoid")
    assert any(part["type"] == "path" for part in sigmoid["artwork"])
    assert any(part["type"] == "text" for part in sigmoid["artwork"])


def test_geometry_gate_accepts_the_compiled_fixture():
    gate = check_lesson_geometry(compile_plan())
    assert gate["approved"], gate["blockers"]


def test_diagram_placement_stays_inside_the_region_and_apart():
    left, top, right, bottom = DIAGRAM
    for count in range(3, 7):
        boxes = _place_diagram(count)
        for box in boxes:
            assert box["x"] >= left and box["y"] >= top
            assert box["x"] + box["width"] <= right + 0.01
            assert box["y"] + box["height"] <= bottom + 0.01
        for index, first in enumerate(boxes):
            for second in boxes[index + 1:]:
                overlap = (min(first["x"] + first["width"], second["x"] + second["width"]) - max(first["x"], second["x"]) > 0
                           and min(first["y"] + first["height"], second["y"] + second["height"]) - max(first["y"], second["y"]) > 0)
                assert not overlap


def test_geometry_gate_blocks_overlapping_nodes():
    lesson = compile_plan()
    nodes = lesson["chapters"][0]["visual"]["nodes"]
    nodes[1]["position"] = dict(nodes[0]["position"])
    gate = check_lesson_geometry(lesson)
    assert not gate["approved"]
    assert any("overlap" in blocker["problem"] for blocker in gate["blockers"])


def test_geometry_gate_blocks_a_node_outside_the_stage():
    lesson = compile_plan()
    lesson["chapters"][0]["visual"]["nodes"][0]["position"]["x"] = -50
    gate = check_lesson_geometry(lesson)
    assert not gate["approved"]


@pytest.mark.parametrize("mutation, message", [
    (lambda p: p.update(chapters=[]), "2–8 chapters"),
    (lambda p: p["chapters"][0].update(layout="carousel"), "layout must be one of"),
    (lambda p: p["chapters"][0]["slots"].append(copy.deepcopy(p["chapters"][0]["slots"][0])),
     "duplicate slot"),
    (lambda p: p["chapters"][0]["slots"][0].update(template="sparkline"), "unknown slot template"),
    (lambda p: p["chapters"][0]["slots"][0].pop("data"), "needs a data object"),
    (lambda p: p["chapters"][0]["connections"][0].update(to="ghost"), "connection must join"),
    (lambda p: p["chapters"][0]["slots"][0].update(color="teal"), "color must be one of"),
])
def test_invalid_plans_are_rejected(mutation, message):
    plan = copy.deepcopy(PLAN)
    mutation(plan)
    with pytest.raises(PlanError, match=message):
        validate_hybrid_plan(plan)


def test_unknown_icons_are_rejected_by_the_live_validator():
    plan = copy.deepcopy(PLAN)
    plan["chapters"][0]["slots"][0]["icon"] = "not-an-asset"
    with pytest.raises(PlanError, match="Unknown SVG asset"):
        compile_hybrid_lesson(plan, ICONS)


def test_labels_text_mode_is_only_allowed_for_diagram_layouts():
    plan = copy.deepcopy(PLAN)
    plan["chapters"][0]["layout"] = "process"
    plan["chapters"][0]["teaching"] = "procedure"
    for slot in plan["chapters"][0]["slots"]:
        slot.pop("data", None)
        slot.pop("template", None)
    with pytest.raises(PlanError, match="diagram layout"):
        compile_hybrid_lesson(plan, ICONS)


def authored_art_plan():
    plan = copy.deepcopy(PLAN)
    for slot in plan["chapters"][0]["slots"]:
        slot.pop("template", None)
        slot.pop("data", None)
    plan["chapters"][0]["slots"][0]["artwork"] = [
        {"type": "circle", "cx": 50, "cy": 50, "r": 26},
        {"type": "line", "x1": 20, "y1": 76, "x2": 78, "y2": 76},
        {"type": "path", "d": "M72 72 L78 76 L72 80 Z", "fill": "blue"},
        {"type": "text", "x": 50, "y": 34, "size": 9, "fill": "white", "text": "x1 = 2"},
        {"type": "text", "x": 50, "y": 88, "size": 9, "fill": "blue", "text": "+1.4"},
    ]
    return plan


def test_a_slot_can_carry_bounded_model_authored_artwork():
    lesson = compile_plan(authored_art_plan())
    node = next(n for n in lesson["chapters"][0]["visual"]["nodes"] if n["id"] == "input-x1")
    assert len(node["artwork"]) == 5
    assert any(part["type"] == "text" for part in node["artwork"])
    assert check_lesson_geometry(lesson)["approved"]


def test_artwork_and_template_are_mutually_exclusive():
    plan = authored_art_plan()
    plan["chapters"][0]["slots"][0]["template"] = "weight-dial"
    plan["chapters"][0]["slots"][0]["data"] = {"weight": 0.7, "product": 1.4}
    with pytest.raises(PlanError, match="not both"):
        validate_hybrid_plan(plan)


def test_artwork_budget_is_enforced():
    plan = authored_art_plan()
    plan["chapters"][0]["slots"][0]["artwork"] = [
        {"type": "circle", "cx": 50, "cy": 50, "r": 4} for _ in range(9)
    ]
    with pytest.raises(PlanError, match="1–8 primitives"):
        validate_hybrid_plan(plan)


def test_artwork_rejects_unsupported_primitives_and_paints():
    plan = authored_art_plan()
    plan["chapters"][0]["slots"][0]["artwork"][0] = {"type": "star", "cx": 50, "cy": 50}
    with pytest.raises(PlanError, match="Supported diagram primitives"):
        validate_hybrid_plan(plan)
    plan = authored_art_plan()
    plan["chapters"][0]["slots"][0]["artwork"][0] = {
        "type": "circle", "cx": 50, "cy": 50, "r": 20, "stroke": "red"}
    with pytest.raises(PlanError, match="named palette paints"):
        validate_hybrid_plan(plan)


def test_labels_mode_flags_hidden_body_and_tag_values():
    lesson = compile_plan()
    chapter = lesson["chapters"][1]
    chapter["visual"]["presentation"]["textMode"] = "labels"
    gate = check_lesson_geometry(lesson)
    assert gate["approved"]
    assert any("labels mode hides" in item["problem"] for item in gate["advisories"])


def test_the_methods_showcase_compiles_with_all_eight_teachings():
    methods = json.loads((ROOT / "src/assistant/visual/methods_plan.json").read_text())
    lesson = compile_hybrid_lesson(methods, ICONS)
    assert len(lesson["chapters"]) == 8
    assert {c["teaching"] for c in lesson["chapters"]} == {
        "construction", "mechanism", "quantitative", "comparison",
        "procedure", "algorithm", "narrative", "recall"}
    assert {c["visual"]["layout"] for c in lesson["chapters"]} == {
        "diagram", "fanin", "comparison", "process", "timeline", "loci"}
    assert check_lesson_geometry(lesson)["approved"]


def test_methods_storyboard_has_the_same_eight_beats_for_live_streaming():
    from assistant.visual.browser_lessons import methods_storyboard
    story = methods_storyboard()
    assert len(story["beats"]) == 8
    assert {beat["teaching"] for beat in story["beats"]} == {
        "construction", "mechanism", "quantitative", "comparison",
        "procedure", "algorithm", "narrative", "recall"}
    assert [beat["continuity"]["from"] for beat in story["beats"]] == [
        None, "construction", "mechanism", "quantity", "comparison",
        "procedure", "algorithm", "narrative"]
    assert all(beat["visibleOperation"] for beat in story["beats"])
