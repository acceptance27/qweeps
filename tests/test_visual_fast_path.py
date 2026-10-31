import io
import json
import re
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from assistant.config import Config
from assistant.llm import ModelProviderError
from assistant.opencode_llm import OpenCodeLLM, _disabled_mcp
from assistant.visual.pedagogy import _compact_scene, _extract_json
from assistant.visual.plan import PlanError, validate_plan, validate_svg

SVG = '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="1" height="1"/></svg>'


def scene(elements, **extra):
    beat = {"title": "Beat", "narration": "Narration", "elements": elements, **extra}
    return {"title": "Title", "summary": "Summary", "beats": [beat]}


def test_missing_svg_reports_missing_not_size():
    with pytest.raises(PlanError, match="markup is missing"):
        validate_svg(None, name="element 'dist_it' SVG")


def test_oversized_svg_reports_actual_size():
    big = '<svg viewBox="0 0 10 10">' + '<rect x="0" y="0" width="1" height="1"/>' * 600 + '</svg>'
    with pytest.raises(PlanError, match="must be at most 20 KB"):
        validate_svg(big, name="element 'chart' SVG")


def test_svg_ref_reuses_an_earlier_asset():
    plan = validate_plan({"title": "T", "summary": "S", "beats": [
        {"title": "One", "narration": "First", "elements": [
            {"id": "chart", "kind": "svg", "label": "chart", "svg": SVG}]},
        {"title": "Two", "narration": "Second", "elements": [
            {"id": "chart_copy", "kind": "svg", "label": "copy", "svgRef": "chart"}]},
    ]})
    assert plan["beats"][1]["elements"][0]["svg"] == SVG


def test_unknown_svg_ref_names_the_bad_reference():
    with pytest.raises(PlanError, match="references svgRef 'nope'"):
        validate_plan(scene([{"id": "chart", "kind": "svg", "label": "c", "svgRef": "nope"}]))


def test_bars_use_one_shared_scale_and_add_value_labels():
    plan = validate_plan(scene([{
        "id": "dist", "kind": "svg", "label": "P(next)", "x": 2, "y": 0, "width": 4.8, "height": 1.5,
        "bars": [{"label": "tired", "value": 0.62}, {"label": "wide", "value": 0.18}]}]))
    beat = plan["beats"][0]
    chart = next(e for e in beat["elements"] if e["id"] == "dist")
    widths = [float(w) for w in re.findall(r'<rect[^>]*? width="([0-9.]+)"', chart["svg"])]
    assert len(widths) == 2
    assert abs(widths[0] / widths[1] - 0.62 / 0.18) < 0.01
    labels = [e for e in beat["elements"] if e["id"].startswith("b0__gen__dist__l")]
    assert [e["label"] for e in labels] == ["tired 0.62", "wide 0.18"]
    assert all(e["x"] < chart["x"] for e in labels)


def test_charts_share_an_absolute_probability_scale_across_beats():
    plan = validate_plan({"title": "T", "summary": "S", "beats": [
        {"title": "One", "narration": "First", "elements": [
            {"id": "a", "kind": "svg", "label": "A", "bars": [{"label": "x", "value": 0.62}]}]},
        {"title": "Two", "narration": "Second", "elements": [
            {"id": "b", "kind": "svg", "label": "B", "bars": [{"label": "x", "value": 0.62}]}]},
    ]})
    widths = []
    for beat in plan["beats"]:
        chart = next(e for e in beat["elements"] if e["kind"] == "svg")
        widths.append(float(re.search(r'<rect[^>]*? width="([0-9.]+)"', chart["svg"]).group(1)))
    assert widths[0] == widths[1]


def test_declared_links_generate_missing_connectors():
    plan = validate_plan(scene([
        {"id": "a", "kind": "box", "label": "A"},
        {"id": "b", "kind": "box", "label": "B"}],
        links=[{"from": "a", "to": "b", "label": "flows"}]))
    edges = [e for e in plan["beats"][0]["elements"] if e["kind"] == "arrow"]
    assert len(edges) == 1 and edges[0]["from"] == "a" and edges[0]["to"] == "b"


def test_existing_connector_is_not_duplicated_by_links():
    plan = validate_plan(scene([
        {"id": "a", "kind": "box", "label": "A"},
        {"id": "b", "kind": "box", "label": "B"},
        {"id": "wire", "kind": "arrow", "from": "a", "to": "b"}],
        links=[{"from": "a", "to": "b"}]))
    assert len([e for e in plan["beats"][0]["elements"] if e["kind"] == "arrow"]) == 1


def test_bars_require_a_bounded_list():
    bars = [{"label": f"b{i}", "value": 0.1} for i in range(13)]
    with pytest.raises(PlanError, match="1–12 entries"):
        validate_plan(scene([{"id": "c", "kind": "svg", "label": "C", "bars": bars}]))


def test_safe_stroke_presentation_attributes_are_allowed():
    validate_svg('<svg viewBox="0 0 10 10"><rect x="0" y="0" width="1" height="1" '
                 'stroke="#ffffff" stroke-dasharray="2 1"/></svg>')


def test_svg_attribute_error_names_the_attribute():
    bad = '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="1" height="1" class="x"/></svg>'
    with pytest.raises(PlanError, match="Unsupported SVG attribute 'class'"):
        validate_svg(bad)


def test_generated_bar_labels_are_not_duplicated_by_a_patch():
    plan = validate_plan(scene([
        {"id": "dist", "kind": "svg", "label": "P", "bars": [{"label": "a", "value": 0.5}, {"label": "b", "value": 0.2}]},
        {"id": "dist_l0", "kind": "text", "label": "a 0.5"},
        {"id": "dist_l1", "kind": "text", "label": "b 0.2"}]))
    ids = [e["id"] for e in plan["beats"][0]["elements"]]
    assert len(ids) == len(set(ids))
    assert sum(1 for i in ids if i.startswith("b0__gen__dist__l")) == 2


def test_field_repair_accepts_bars_for_a_missing_chart():
    from assistant.visual.pedagogy import _repair_direction

    class Reply:
        def __init__(self, text): self.text = text
        def _chat(self, messages, max_tokens=None): return self.text

    plan = {"title": "T", "summary": "S", "beats": [
        {"title": "B", "narration": "N", "elements": [
            {"id": "chart", "kind": "svg", "label": "P(next)"}]}]}
    parsed = {"answer": "A", "scene": plan,
              "evidence": [{"beat": "b1", "objects": ["chart"]}]}
    storyboard = {"beats": [{"id": "b1", "question": "q", "insight": "i"}]}
    reply = Reply(json.dumps({"elements": [{"beat": 0, "id": "chart",
                                             "bars": [{"label": "tired", "value": 0.62},
                                                      {"label": "wide", "value": 0.18}]}]}))
    repaired = _repair_direction(reply, parsed, {"question": "q"}, storyboard)
    rebuilt = validate_plan(repaired["scene"])
    chart = rebuilt["beats"][0]["elements"][0]
    assert chart["bars"] and chart["svg"].startswith("<svg")


def test_field_repair_supplies_answer_and_evidence_without_rewriting_the_scene():
    from assistant.visual.pedagogy import _repair_direction

    class Reply:
        def __init__(self, text): self.text = text
        def _chat(self, messages, max_tokens=None): return self.text

    plan = validate_plan(scene([{"id": "n", "kind": "box", "label": "N"}]))
    parsed = {"answer": "", "scene": plan, "evidence": []}
    storyboard = {"beats": [{"id": "b1", "question": "q", "insight": "i"}]}
    reply = Reply(json.dumps({"answer": "A", "evidence": [{"beat": "b1", "objects": ["n"]}]}))
    repaired = _repair_direction(reply, parsed, {"question": "q"}, storyboard)
    assert repaired["answer"] == "A"
    assert repaired["evidence"] == [{"beat": "b1", "objects": ["n"]}]
    assert repaired["scene"]["beats"][0]["elements"][0]["id"] == "n"


def test_beat_defaults_fill_missing_element_fields():
    plan = validate_plan(scene([{"id": "node", "kind": "box", "label": "node"}],
                               defaults={"color": "#FC6255", "entrance": "grow"}))
    element = plan["beats"][0]["elements"][0]
    assert element["color"] == "#FC6255" and element["entrance"] == "grow"


def test_unknown_beat_default_is_rejected():
    with pytest.raises(PlanError, match="beat defaults may only set"):
        validate_plan(scene([{"id": "node", "kind": "box"}], defaults={"width": 3}))


def test_beat_element_cap_forces_grouping():
    elements = [{"id": f"n{i}", "kind": "box", "label": str(i)} for i in range(41)]
    with pytest.raises(PlanError, match="1–40 elements"):
        validate_plan(scene(elements))


def test_long_text_label_is_rejected():
    with pytest.raises(PlanError, match="at most 45–60 characters"):
        validate_plan(scene([{"id": "t", "kind": "text", "label": "x" * 70}]))


def test_json_is_extracted_from_prose_and_fences():
    assert _extract_json('Here you go:\n```json\n{"a": 1}\n```\nThanks') == {"a": 1}
    assert _extract_json('{"a": {"b": 2}} trailing') == {"a": {"b": 2}}
    assert _extract_json("no object here") is None


def test_compact_review_payload_drops_svg_markup_but_keeps_teaching():
    plan = validate_plan({
        "title": "T", "summary": "S",
        "beats": [{"title": "One", "narration": "First",
                   "elements": [{"id": "chart", "kind": "svg", "label": "c", "svg": SVG}],
                   "teaching": {"planBeat": "b1", "question": "q", "insight": "i", "evidence": ["chart"]}}]})
    compact = _compact_scene(plan)
    element = compact["beats"][0]["elements"][0]
    assert element["svg"].startswith("<svg asset")
    assert compact["beats"][0]["teaching"]["evidence"] == ["chart"]


def test_user_mcp_servers_are_placed_in_disabled_state(tmp_path, monkeypatch):
    config = tmp_path / ".config" / "opencode" / "opencode.json"
    config.parent.mkdir(parents=True)
    config.write_text(json.dumps({"mcp": {"playwright": {"type": "local", "command": ["npx"]},
                                          "unityMCP": {"type": "remote", "url": "http://127.0.0.1:8080/mcp"}}}))
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    disabled = _disabled_mcp()
    assert disabled["playwright"]["enabled"] is False
    assert disabled["unityMCP"]["enabled"] is False
    assert disabled["playwright"]["command"] == ["npx"]


def process(events, returncode=0):
    proc = Mock()
    proc.stdout = io.StringIO('\n'.join(json.dumps(e) for e in events))
    proc.stderr = io.StringIO('')
    proc.poll.return_value = None
    proc.returncode = returncode
    return proc


def test_calls_are_logged_with_model_seconds_and_sizes(tmp_path):
    cfg = Config()
    cfg.llm.visual_model = "opencode-go/deepseek-v4.1-flash"
    cfg.llm.visual_vision_model = "opencode-go/deepseek-v4.1-flash"
    with patch("assistant.opencode_llm.shutil.which", return_value="/bin/opencode"):
        llm = OpenCodeLLM(cfg, provider="opencode-go")
    log = tmp_path / "calls.jsonl"
    with patch.dict("os.environ", {"QWEEPS_CALL_LOG": str(log)}), \
            patch("assistant.opencode_llm.subprocess.Popen",
                  return_value=process([{"type": "text", "part": {"text": '{"ok":true}'}}])):
        assert llm.compose("do the task", "system") == '{"ok":true}'
    record = json.loads(log.read_text().strip())
    assert record["model"] == "opencode-go/deepseek-v4.1-flash"
    assert record["ok"] is True and record["outputChars"] == len('{"ok":true}')
    assert record["seconds"] >= 0 and record["provider"] == "opencode-go"


def test_failed_call_is_logged_as_not_ok(tmp_path):
    cfg = Config()
    cfg.llm.visual_model = "opencode-go/deepseek-v4.1-flash"
    with patch("assistant.opencode_llm.shutil.which", return_value="/bin/opencode"):
        llm = OpenCodeLLM(cfg, provider="opencode-go")
    log = tmp_path / "calls.jsonl"
    with patch.dict("os.environ", {"QWEEPS_CALL_LOG": str(log)}), \
            patch("assistant.opencode_llm.subprocess.Popen",
                  return_value=process([{"type": "text", "part": {"text": "partial"}}], returncode=1)):
        with pytest.raises(ModelProviderError):
            llm.compose("do the task")
    record = json.loads(log.read_text().strip())
    assert record["ok"] is False and "error" in record


def test_negative_bars_are_rejected_and_non_finite_values_clamp():
    with pytest.raises(PlanError, match="cannot encode negative values"):
        validate_plan(scene([{
            "id": "dist", "kind": "svg", "label": "P",
            "bars": [{"label": "a", "value": -2}]}]))
    plan = validate_plan(scene([{
        "id": "dist", "kind": "svg", "label": "P",
        "bars": [{"label": "b", "value": float("nan")}]}]))
    assert plan["beats"][0]["elements"][0]["bars"][0]["value"] == 0


def test_unsupported_svg_elements_are_named():
    with pytest.raises(PlanError, match="Unsupported SVG element 'text'"):
        validate_svg('<svg viewBox="0 0 10 10"><text>hi</text></svg>')
