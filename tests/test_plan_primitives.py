import pytest

from assistant.visual.plan import PlanError, ROLE_SLOTS, validate_plan


def scene(elements, **beat):
    return {"title": "T", "summary": "S",
            "beats": [{"title": "B", "narration": "N", "elements": elements, **beat}]}


def test_role_table_maps_identity_to_palette_and_badge():
    plan = validate_plan({**scene([{"id": "tok", "kind": "box", "label": "token",
                                    "semanticRole": "input_token",
                                    "focusState": "muted"}]),
                          "roleTable": {"input_token": "slot_0"}})
    element = plan["beats"][0]["elements"][0]
    assert element["color"] == ROLE_SLOTS["slot_0"]["color"]
    assert element["badge"] == "INPU"
    assert element["focusState"] == "muted"
    assert element["opacity"] <= 0.45


def test_undeclared_role_and_unknown_slot_are_rejected():
    with pytest.raises(PlanError, match="not declared in roleTable"):
        validate_plan(scene([{"id": "tok", "kind": "box", "label": "t",
                              "semanticRole": "input_token"}]))
    with pytest.raises(PlanError, match="unknown palette slot"):
        validate_plan({**scene([{"id": "a", "kind": "box"}]), "roleTable": {"x": "slot_99"}})


def test_derived_elements_must_follow_their_parent_exposure():
    good = validate_plan(scene([
        {"id": "word", "kind": "text", "label": "unbelievable", "revealAt": 0},
        {"id": "part", "kind": "text", "label": "un", "revealAt": 1.0,
         "derivedFrom": "word"}]))
    assert good["beats"][0]["elements"][1]["derivedFrom"] == "word"
    repaired = validate_plan(scene([
        {"id": "word", "kind": "text", "label": "unbelievable", "revealAt": 0},
        {"id": "part", "kind": "text", "label": "un", "revealAt": 0.5,
         "derivedFrom": "word"}]))
    part = repaired["beats"][0]["elements"][1]
    assert part["revealAt"] >= 0.9


def test_derived_element_needs_a_known_parent():
    with pytest.raises(PlanError, match="derives from unknown"):
        validate_plan(scene([{"id": "part", "kind": "text", "label": "un",
                              "derivedFrom": "ghost"}]))


def test_derived_parent_can_come_from_a_previous_beat():
    plan = validate_plan({"title": "T", "summary": "S", "beats": [
        {"title": "One", "narration": "First", "duration": 10,
         "elements": [{"id": "word", "kind": "text", "label": "unbelievable", "revealAt": 0}]},
        {"title": "Two", "narration": "Second", "duration": 10,
         "elements": [{"id": "part", "kind": "text", "label": "un", "derivedFrom": "word"}]},
    ]})
    assert plan["beats"][1]["elements"][0]["derivedFrom"] == "word"


def test_parent_containment_accepts_inside_and_rejects_overflow():
    box = {"id": "panel", "kind": "box", "label": "panel",
           "x": 0, "y": 0, "width": 4, "height": 2}
    inside = {"id": "chip", "kind": "box", "label": "chip", "parentId": "panel",
              "x": 0, "y": 0, "width": 1, "height": 0.5}
    plan = validate_plan(scene([box, inside]))
    assert plan["beats"][0]["elements"][1]["parentId"] == "panel"
    outside = {**inside, "x": 2.2, "width": 1.0}
    with pytest.raises(PlanError, match="overflows its parent"):
        validate_plan(scene([box, outside]))
    with pytest.raises(PlanError, match="unknown parentId"):
        validate_plan(scene([{**inside, "parentId": "ghost"}]))


def test_authoring_ids_cannot_use_the_generated_namespace():
    with pytest.raises(PlanError, match="generated namespace"):
        validate_plan(scene([{"id": "b0__gen__chart__l0", "kind": "box"}]))
    with pytest.raises(PlanError, match="invalid"):
        validate_plan(scene([{"id": "has.dot", "kind": "box"}]))


def test_numeric_strings_are_coerced_in_the_compiler():
    plan = validate_plan(scene([{"id": "a", "kind": "box", "x": "1.5", "y": "0",
                                 "width": "2", "height": "1", "opacity": "0.8"}]))
    element = plan["beats"][0]["elements"][0]
    assert element["x"] == 1.5 and element["width"] == 2.0 and element["opacity"] == 0.8


def test_out_of_range_geometry_is_clamped_not_fatal():
    plan = validate_plan(scene([{"id": "a", "kind": "box", "x": 100, "y": -100,
                                 "width": 0, "height": 20}]))
    element = plan["beats"][0]["elements"][0]
    assert element["x"] == 40 and element["y"] == -40
    assert element["width"] == 0.1 and element["height"] == 8


def test_a_derived_parent_outside_the_camera_drops_the_claim():
    plan = validate_plan(scene([
        {"id": "far", "kind": "box", "label": "far", "x": 20, "y": 0},
        {"id": "child", "kind": "text", "label": "c", "x": 0, "y": 1,
         "derivedFrom": "far"}]))
    child = plan["beats"][0]["elements"][1]
    assert "derivedFrom" not in child


def test_an_arrow_cannot_be_a_derived_parent():
    plan = validate_plan(scene([
        {"id": "a", "kind": "box", "label": "a", "x": -2, "y": 0},
        {"id": "b", "kind": "box", "label": "b", "x": 2, "y": 0},
        {"id": "wire", "kind": "arrow", "from": "a", "to": "b"},
        {"id": "child", "kind": "text", "label": "c", "x": 0, "y": 1,
         "derivedFrom": "wire"}]))
    child = plan["beats"][0]["elements"][3]
    assert "derivedFrom" not in child


def test_a_connector_without_endpoints_is_dropped_not_fatal():
    plan = validate_plan(scene([
        {"id": "a", "kind": "box", "label": "a"},
        {"id": "floating", "kind": "line", "label": "decor"}]))
    ids = {e["id"] for e in plan["beats"][0]["elements"]}
    assert "floating" not in ids and "a" in ids


def test_malformed_paths_are_dropped_and_flat_points_are_paired():
    plan = validate_plan(scene([
        {"id": "broken", "kind": "path", "label": "b"},
        {"id": "curve", "kind": "path", "label": "c", "points": [0, 0, 0.5, -0.5]}]))
    ids = {e["id"] for e in plan["beats"][0]["elements"]}
    assert "broken" not in ids
    curve = next(e for e in plan["beats"][0]["elements"] if e["id"] == "curve")
    assert curve["points"] == [[0.0, 0.0], [0.5, -0.5]]
