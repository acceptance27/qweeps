import pytest

from assistant.visual.plan import PlanError, validate_plan
from assistant.visual.v3 import (authoring_hash, build_envelope, canonical_json,
                                 compile_lesson, needs_recompile, validate_envelope)


def test_canonical_json_is_sorted_and_fixed_precision():
    assert canonical_json({"b": 0.1, "a": 1}) == '{"a":1,"b":0.100000}'
    assert canonical_json([1, 0.0, -0.0]) == "[1,0.000000,0.000000]"
    with pytest.raises(PlanError):
        canonical_json({"x": float("nan")})


def test_authoring_hash_is_stable_across_key_order_and_detects_drift():
    spec_a = {"cueTimes": {"draw": 2.0}, "roleTable": {"token": "slot_0"}}
    spec_b = {"roleTable": {"token": "slot_0"}, "cueTimes": {"draw": 2.0}}
    beats = [{"id": "b1", "elements": [{"id": "a"}]}]
    assert authoring_hash(spec_a, beats) == authoring_hash(spec_b, beats)
    envelope = build_envelope(spec_a, beats, {"title": "T", "beats": []})
    validate_envelope(envelope)
    broken = dict(envelope, authoringSha256="0" * 64)
    with pytest.raises(PlanError, match="mismatch"):
        validate_envelope(broken)
    assert needs_recompile(broken)


def test_compile_lesson_lowers_cues_bars_and_provenance():
    authoring = {
        "title": "T", "summary": "S", "roleTable": {"candidate": "slot_3"},
        "beats": [{"title": "B", "narration": "N", "elements": [
            {"id": "chart", "kind": "svg", "label": "P", "semanticRole": "candidate",
             "drawDuration": 1.0, "revealAt": "with:cue.draw",
             "bars": [{"label": "tired", "value": 0.62}, {"label": "wide", "value": 0.18}]},
            {"id": "tok", "kind": "text", "label": "mat", "revealAt": "after:el.chart.end+0.2"},
        ]}],
    }
    result = compile_lesson(authoring, {"draw": 2.0})
    beat = result["compiled"]["beats"][0]
    chart = next(e for e in beat["elements"] if e["id"] == "chart")
    token = next(e for e in beat["elements"] if e["id"] == "tok")
    assert chart["revealAt"] == 2.0
    assert token["revealAt"] == 3.2
    assert chart["bars"] and chart["svg"].startswith("<svg")
    labels = [e for e in beat["elements"] if e["id"].startswith("b0__gen__chart__l")]
    assert [e["label"] for e in labels] == ["tired 0.62", "wide 0.18"]
    assert result["provenance"][labels[0]["id"]]["authoringId"] == "chart"
    assert result["snapshots"][0]["visualStart"] == 0
    assert validate_envelope(result["envelope"])
    assert not needs_recompile(result["envelope"])


def test_compile_lesson_rejects_an_unaccepted_cue():
    authoring = {"title": "T", "summary": "S", "beats": [
        {"title": "B", "narration": "N", "elements": [
            {"id": "out", "kind": "text", "label": "x", "semanticRole": "result",
             "revealAt": "with:cue.missing"}]}]}
    with pytest.raises(Exception, match="unknown cue"):
        compile_lesson(authoring, {})


def test_text_layout_wraps_and_reports_unfittable_copy():
    from assistant.visual.text_layout import layout

    fitted = layout("the cat sat on the mat", 2, 0.5)
    assert fitted["fits"] and len(fitted["lines"]) >= 2
    assert layout("x" * 120, 1, 0.4)["fits"] is False


def test_compile_lesson_owns_text_layout():
    authoring = {"title": "T", "summary": "S", "beats": [
        {"title": "B", "narration": "N", "elements": [
            {"id": "label", "kind": "text", "label": "the cat sat on the mat",
             "x": 0, "y": 0, "width": 2, "height": 0.5}]}]}
    result = compile_lesson(authoring, {})
    element = result["compiled"]["beats"][0]["elements"][0]
    assert element["lines"] and element["fontSize"] > 0


def test_a_label_fully_inside_one_shape_becomes_its_child():
    authoring = {"title": "T", "summary": "S", "beats": [
        {"title": "B", "narration": "N", "elements": [
            {"id": "panel", "kind": "box", "label": "panel", "x": 0, "y": 0,
             "width": 4, "height": 2},
            {"id": "label", "kind": "text", "label": "inside", "x": 0, "y": 0,
             "width": 1, "height": 0.4}]}]}
    result = compile_lesson(authoring, {})
    label = next(e for e in result["compiled"]["beats"][0]["elements"] if e["id"] == "label")
    assert label["parentId"] == "panel"


def test_compile_lesson_drops_a_degenerate_edge_but_validate_plan_stays_strict():
    authoring = {"title": "T", "summary": "S", "beats": [
        {"title": "B", "narration": "N", "elements": [
            {"id": "a", "kind": "box", "label": "a"},
            {"id": "bad", "kind": "arrow", "from": "a", "to": "ghost"}]}]}
    result = compile_lesson(authoring, {})
    ids = {e["id"] for e in result["compiled"]["beats"][0]["elements"]}
    assert "bad" not in ids and "a" in ids
    with pytest.raises(PlanError, match="edges must connect"):
        validate_plan(authoring)


def test_compile_lesson_clamps_a_child_inside_its_parent():
    authoring = {"title": "T", "summary": "S", "beats": [
        {"title": "B", "narration": "N", "elements": [
            {"id": "bar", "kind": "box", "label": "bar", "x": 0, "y": 0, "width": 4, "height": 2},
            {"id": "seg", "kind": "box", "label": "seg", "parentId": "bar",
             "x": 2.4, "y": 0, "width": 1, "height": 0.5}]}]}
    result = compile_lesson(authoring, {})
    seg = next(e for e in result["compiled"]["beats"][0]["elements"] if e["id"] == "seg")
    assert seg["x"] + seg["width"] / 2 <= 2.0 - 0.05 + 1e-6


def test_compile_lesson_keeps_the_first_duplicate_id():
    authoring = {"title": "T", "summary": "S", "beats": [
        {"title": "B", "narration": "N", "elements": [
            {"id": "curve", "kind": "box", "label": "first", "x": -2, "y": 0},
            {"id": "curve", "kind": "box", "label": "second", "x": 2, "y": 0}]}]}
    result = compile_lesson(authoring, {})
    elements = result["compiled"]["beats"][0]["elements"]
    assert [e["id"] for e in elements] == ["curve"]
    assert elements[0]["label"] == "first"
    with pytest.raises(PlanError, match="unique"):
        validate_plan(authoring)
