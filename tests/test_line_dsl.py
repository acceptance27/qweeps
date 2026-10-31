from pathlib import Path

import pytest

from assistant.visual.line_dsl import lower, parse
from assistant.visual.plan import PlanError
from assistant.visual.v3 import compile_lesson

ROOT = Path(__file__).resolve().parents[1]
CUES = {"project": 1.0, "top_prob": 3.0, "sample_draw": 4.5, "append_tok": 6.0}
NARRATION = ("Now that the context vector holds the prompt's meaning, it projects into a "
             "probability chart. Here mat leads at sixty-two percent, so the sampler draws "
             "mat and appends it to the input sequence.")
ROLES = {"input_token": "slot_0", "embedding_vector": "slot_1",
         "attention_weight": "slot_2", "probability_dist": "slot_3",
         "sampled_output": "slot_4"}
STATE = {
    "token_row": {"id": "token_row", "kind": "group", "x": -3.4, "y": 0,
                  "width": 4.0, "height": 0.8, "semanticRole": "input_token", "label": "tokens"},
    "context_vec": {"id": "context_vec", "kind": "box", "x": 1.8, "y": 0,
                    "width": 2.0, "height": 0.8, "semanticRole": "embedding_vector",
                    "label": "context"},
}
REGISTRY = {
    "proj_arrow": {"kind": "link", "semanticRole": "attention_weight"},
    "dist_chart": {"kind": "chart", "semanticRole": "probability_dist"},
    "sampled_mat": {"kind": "chip", "semanticRole": "sampled_output", "label": "mat",
                    "derivedFrom": "dist_chart"},
}


def test_canonical_dsl_needs_no_normalizations():
    raw = ("beat 3\nretain token_row\n@cue:project\n"
           "  chart dist_chart type=bars data=[mat:0.62, floor:0.18] dock=right-of:context_vec\n")
    parsed = parse(raw, ["project"])
    assert parsed["normalizations"] == []


def test_five_normalizations_are_detected():
    assert "fences" in parse("```dsl\nbeat 3\n```", [])["normalizations"]
    assert "cue_alias" in parse("beat 3\n@project\n", ["project"])["normalizations"]
    assert "separators" in parse("beat 3\n@cue:project\n  show a dock:right-of:b\n", ["project"])["normalizations"]
    assert "list_commas" in parse("beat 3\n@cue:project\n  chart c data=[a:0.5 b:0.2]\n", ["project"])["normalizations"]
    assert "keyword_case" in parse("beat 3\nSHOW a\n", [])["normalizations"]


def test_unknown_cue_and_missing_beat_are_rejected():
    with pytest.raises(PlanError, match="unknown cue"):
        parse("beat 3\n@cue:ghost\n  show a\n", ["project"])
    with pytest.raises(PlanError, match="missing a beat"):
        parse("@cue:project\n  show a\n", ["project"])


@pytest.mark.parametrize("name", ["muse-spark-1.3-contributor-1.dsl",
                                  "deepseek-v4.1-flash-1.dsl"])
def test_real_model_dsl_lowers_and_compiles(name):
    path = ROOT / "bench" / "dsl-smoke" / name
    if not path.exists():
        pytest.skip("smoke output not present")
    parsed = parse(path.read_text(), list(CUES))
    beat = lower(parsed, STATE, REGISTRY, NARRATION, CUES, title="Beat 3")
    result = compile_lesson({"title": "T", "summary": "S", "roleTable": ROLES,
                             "beats": [beat]}, CUES)
    elements = {element["id"]: element for element in result["compiled"]["beats"][0]["elements"]}
    chart = elements["dist_chart"]
    assert chart["kind"] == "svg"
    assert any(bar["label"] == "mat" and abs(bar["value"] - 0.62) < 1e-6 for bar in chart["bars"])
    link = elements["proj_arrow"]
    assert link["kind"] == "arrow" and link["from"] == "context_vec" and link["to"] == "dist_chart"
    assert elements["sampled_mat"]["revealAt"] >= 4.5
    assert elements["token_row"]["kind"] == "box"


def test_dock_layout_places_a_chart_right_of_its_target():
    raw = ("beat 3\n@cue:project\n  chart dist_chart type=bars data=[mat:0.62] "
           "dock=right-of:context_vec\n")
    beat = lower(parse(raw, ["project"]), STATE, REGISTRY, NARRATION, CUES)
    chart = next(element for element in beat["elements"] if element["id"] == "dist_chart")
    assert chart["x"] > STATE["context_vec"]["x"]
    assert chart["y"] == STATE["context_vec"]["y"]


def test_beat_accepts_a_storyboard_id_instead_of_a_number():
    parsed = parse("beat b1_scale\n@cue:project\n  show a\n", ["project"])
    assert parsed["beat"] == "b1_scale"


def test_group_zone_is_placed_before_its_children_dock_inside():
    raw = ("beat 1\ngroup inputs contains=[x1] zone=left_mid\n"
           "@cue:draw\nshow x1 dock=inside:inputs\n")
    beat = lower(parse(raw, ["draw"]), {}, {"x1": {"kind": "box", "role": "input_token"}},
                 "Draw inputs.", {"draw": 0.4})
    ids = {e["id"] for e in beat["elements"]}
    child = next(e for e in beat["elements"] if e["id"] == "x1")
    assert "inputs" not in ids
    assert child["x"] == -3.4 and child["y"] == 0


def test_link_id_colliding_with_a_weight_box_is_renamed():
    raw = ("beat 1\n@cue:draw\nshow w1 label=\"0.6\" zone=center_mid\n"
           "show x1 zone=left_mid\nshow n zone=right_mid\n"
           "link w1 from=x1 to=n style=solid\n")
    beat = lower(parse(raw, ["draw"]), {}, {"w1": {"kind": "box", "role": "context"},
                 "x1": {"kind": "box", "role": "input_token"},
                 "n": {"kind": "box", "role": "result"}}, "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    assert by_id["w1"]["kind"] == "box"
    link = next(e for e in beat["elements"] if e["kind"] == "arrow")
    assert link["from"] == "x1" and link["to"] == "n" and link["id"].startswith("w1_link")


def test_stacked_text_labels_are_separated_deterministically():
    raw = ("beat 1\n@cue:draw\nshow y_val label=\"y\" zone=center_mid\n"
           "show z_val label=\"z\" zone=center_mid\n")
    registry = {"y_val": {"kind": "text"}, "z_val": {"kind": "text"}}
    beat = lower(parse(raw, ["draw"]), {}, registry, "N.", {"draw": 0.4})
    y = next(e for e in beat["elements"] if e["id"] == "y_val")
    z = next(e for e in beat["elements"] if e["id"] == "z_val")
    assert y["y"] != z["y"]


def test_a_label_can_dock_to_a_link_created_earlier_in_the_same_beat():
    raw = ("beat 1\n@cue:draw\nshow x zone=left_mid\nshow n zone=right_mid\n"
           "link w1 from=x to=n style=solid\n"
           "show w1_label label=\"0.6\" dock=above:w1\n")
    registry = {"x": {"kind": "box", "role": "input_token"},
                "n": {"kind": "box", "role": "result"},
                "w1": {"kind": "arrow"}, "w1_label": {"kind": "text"}}
    beat = lower(parse(raw, ["draw"]), {}, registry, "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    assert by_id["w1"]["kind"] == "arrow"
    assert by_id["w1_label"]["y"] > by_id["w1"]["y"]


def test_align_accepts_the_optional_target_suffix():
    raw = ("beat 1\n@cue:draw\nshow part zone=center_mid\n"
           "show x dock=left-of:part align=top:part\n")
    beat = lower(parse(raw, ["draw"]), {}, {"part": {"kind": "box"}, "x": {"kind": "box"}},
                 "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    part, x = by_id["part"], by_id["x"]
    assert x["y"] == part["y"] + part["height"] / 2 - x["height"] / 2


def test_move_keeps_the_id_so_the_engine_can_animate_the_same_object():
    raw = ("beat 2\nretain dot\n@cue:bias\nshow bias zone=right_mid\nmove dot to=inside:bias\n")
    state = {"dot": {"id": "dot", "kind": "circle", "x": -2.0, "y": 0.0, "width": 0.6,
                     "height": 0.6, "revealAt": "with:cue.sum", "semanticRole": "sampled_output"}}
    registry = {"dot": {"kind": "circle", "role": "sampled_output"},
                "bias": {"kind": "box", "role": "context"}}
    beat = lower(parse(raw, ["bias"]), state, registry, "Bias moves the dot.",
                 {"bias": 1.2})
    dot = next(e for e in beat["elements"] if e["id"] == "dot")
    assert dot["x"] != -2.0


def test_zone_is_kept_so_shown_objects_do_not_pile_up_at_the_origin():
    raw = ("beat 1\n@cue:draw\nshow a zone=left_mid\nshow b zone=right_mid\n")
    beat = lower(parse(raw, ["draw"]), {}, {"a": {"kind": "box"}, "b": {"kind": "box"}},
                 "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    assert (by_id["a"]["x"], by_id["a"]["y"]) == (-3.4, 0)
    assert (by_id["b"]["x"], by_id["b"]["y"]) == (3.4, 0)


def test_siblings_docked_identically_are_stacked_not_superimposed():
    raw = ("beat 1\n@cue:draw\nshow hub zone=center_mid\n"
           "show a dock=left-of:hub\nshow b dock=left-of:hub\n")
    beat = lower(parse(raw, ["draw"]), {},
                 {"hub": {"kind": "box", "role": "result"},
                  "a": {"kind": "box", "role": "input_token"},
                  "b": {"kind": "box", "role": "input_token"}}, "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    assert by_id["a"]["y"] != by_id["b"]["y"]


def test_sign_sets_a_colourblind_safe_arrow_colour():
    raw = ("beat 1\n@cue:draw\nshow x zone=left_mid\nshow n1 zone=right_top\nshow n2 zone=right_bottom\n"
           "link wp from=x to=n1 sign=+\nlink wn from=x to=n2 sign=-\n")
    registry = {"x": {"kind": "box"}, "n1": {"kind": "box"}, "n2": {"kind": "box"},
                "wp": {"kind": "arrow"}, "wn": {"kind": "arrow"}}
    beat = lower(parse(raw, ["draw"]), {}, registry, "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    assert by_id["wp"]["color"] != by_id["wn"]["color"]


def test_a_declared_curve_cannot_vanish_without_geometry():
    import pytest
    from assistant.visual.plan import PlanError
    raw = "beat 1\n@cue:draw\nshow curve zone=right_mid\n"
    with pytest.raises(PlanError, match="declared path"):
        lower(parse(raw, ["draw"]), {}, {"curve": {"kind": "path", "role": "curve"}},
              "N.", {"draw": 0.4})


def test_chart_line_keeps_its_type_for_the_compiler():
    raw = ("beat 1\n@cue:draw\nchart curve type=line data=[1:0.5, 2:0.9] "
           "zone=right_mid\n")
    beat = lower(parse(raw, ["draw"]), {}, {"curve": {"kind": "path", "role": "curve"}},
                 "N.", {"draw": 0.4})
    element = next(e for e in beat["elements"] if e["id"] == "curve")
    assert element["chartType"] == "line"
    assert [bar["value"] for bar in element["bars"]] == [0.5, 0.9]


def test_weight_labels_sit_near_the_source_of_their_own_arrow():
    raw = ("beat 1\n@cue:draw\nshow x1 zone=left_top\nshow x2 zone=left_bottom\n"
           "show n zone=right_mid\nlink w1 from=x1 to=n\nlink w2 from=x2 to=n\n"
           "show w1l label=\"1\" dock=above:w1\nshow w2l label=\"-0.5\" dock=above:w2\n")
    registry = {"x1": {"kind": "circle"}, "x2": {"kind": "circle"}, "n": {"kind": "circle"},
                "w1": {"kind": "arrow"}, "w2": {"kind": "arrow"},
                "w1l": {"kind": "text"}, "w2l": {"kind": "text"}}
    beat = lower(parse(raw, ["draw"]), {}, registry, "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    assert by_id["w1l"]["y"] > by_id["w2l"]["y"]
    assert by_id["w1l"]["x"] < by_id["x1"]["x"] + 2.0
    assert by_id["w2l"]["x"] < by_id["x2"]["x"] + 2.0


def test_plot_places_a_marker_on_the_named_data_point():
    raw = ("beat 1\n@cue:draw\nchart curve type=line data=[0:0.2, 1:0.6, 2:0.9] zone=center_mid\n"
           "plot dot on=curve at=2\n")
    registry = {"curve": {"kind": "svg", "role": "curve"},
                "dot": {"kind": "circle", "role": "marker_dot"}}
    beat = lower(parse(raw, ["draw"]), {}, registry, "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    chart, dot = by_id["curve"], by_id["dot"]
    assert dot["x"] > chart["x"] + chart["width"] * 0.35
    assert dot["y"] > chart["y"] + chart["height"] * 0.25
    assert dot["width"] <= 0.6 and dot["height"] <= 0.6


def test_a_chart_larger_than_its_host_is_placed_beside_it_not_inside():
    raw = ("beat 1\n@cue:draw\nshow node zone=center_mid\n"
           "chart curve type=line data=[0:0.2, 1:0.9] dock=inside:node\n")
    beat = lower(parse(raw, ["draw"]), {}, {"node": {"kind": "circle"}, "curve": {"kind": "svg"}},
                 "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    assert by_id["curve"]["x"] > by_id["node"]["x"] + by_id["node"]["width"] / 2


def test_relabelling_the_same_element_twice_in_one_beat_is_rejected():
    import pytest
    from assistant.visual.plan import PlanError
    raw = ("beat 2\nretain total\n@cue:before\nshow total label=\"0.6\" dock=inside:hub\n"
           "@cue:after\nshow total label=\"0.7\" dock=inside:hub\n")
    state = {"hub": {"id": "hub", "kind": "circle", "x": 0, "y": 0, "width": 2, "height": 1},
             "total": {"id": "total", "kind": "text", "x": 0, "y": 0, "width": 1, "height": 0.4,
                       "label": "0.6"}}
    registry = {"total": {"kind": "text", "role": "total"},
                "hub": {"kind": "circle", "role": "sum"}}
    with pytest.raises(PlanError, match="shown twice in one beat"):
        lower(parse(raw, ["before", "after"]), state, registry, "N.",
              {"before": 0.4, "after": 2.0})


def test_a_labelled_connector_id_becomes_a_caption():
    raw = "beat 1\n@cue:draw\nshow edge label=\"w=1\" zone=center_mid\n"
    beat = lower(parse(raw, ["draw"]), {}, {"edge": {"kind": "arrow", "role": "weight"}},
                 "N.", {"draw": 0.4})
    element = next(e for e in beat["elements"] if e["id"] == "edge")
    assert element["kind"] == "text" and element["label"] == "w=1"


def test_an_unlabelled_connector_show_explains_to_use_link():
    import pytest
    from assistant.visual.plan import PlanError
    raw = "beat 1\n@cue:draw\nshow edge zone=center_mid\n"
    with pytest.raises(PlanError, match="use `link edge"):
        lower(parse(raw, ["draw"]), {}, {"edge": {"kind": "arrow", "role": "weight"}},
              "N.", {"draw": 0.4})


def test_link_error_names_the_missing_endpoint():
    import pytest
    from assistant.visual.plan import PlanError
    raw = ("beat 1\n@cue:draw\nshow a zone=left_mid\n"
           "link edge from=a to=ghost\n")
    with pytest.raises(PlanError, match="unknown \\['ghost'\\]"):
        lower(parse(raw, ["draw"]), {}, {"a": {"kind": "box"}, "edge": {"kind": "arrow"}},
              "N.", {"draw": 0.4})


def test_a_chart_that_falls_out_of_its_host_still_avoids_other_objects():
    raw = ("beat 1\n@cue:draw\nshow node zone=center_mid\n"
           "show total label=\"0.7\" dock=right-of:node\n"
           "chart trace type=line data=[0:0.6, 1:0.7] dock=inside:node\n")
    beat = lower(parse(raw, ["draw"]), {},
                 {"node": {"kind": "circle"}, "total": {"kind": "text"},
                  "trace": {"kind": "svg"}}, "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    chart, label = by_id["trace"], by_id["total"]
    separated = (abs(chart["x"] - label["x"]) >= (chart["width"] + label["width"]) / 2
                 or abs(chart["y"] - label["y"]) >= (chart["height"] + label["height"]) / 2)
    assert separated


def test_a_second_identical_connector_is_rejected_with_guidance():
    import pytest
    from assistant.visual.plan import PlanError
    raw = ("beat 2\nretain a, b, flow\n@cue:draw\n"
           "link weight from=a to=b\n")
    state = {"a": {"id": "a", "kind": "box", "x": -2, "y": 0, "width": 2, "height": 1},
             "b": {"id": "b", "kind": "box", "x": 2, "y": 0, "width": 2, "height": 1},
             "flow": {"id": "flow", "kind": "arrow", "from": "a", "to": "b",
                      "x": 0, "y": 0, "width": 4, "height": 0.2}}
    registry = {"a": {"kind": "box"}, "b": {"kind": "box"},
                "flow": {"kind": "arrow"}, "weight": {"kind": "arrow"}}
    with pytest.raises(PlanError, match="duplicates connector 'flow'"):
        lower(parse(raw, ["draw"]), state, registry, "N.", {"draw": 0.4})


def test_plot_uses_the_numeric_key_domain_not_the_index():
    raw = ("beat 1\n@cue:draw\n"
           "chart curve type=line data=[0:0, 0.5:0.5, 2:1] zone=center_mid\n"
           "plot dot on=curve at=0.5\n")
    registry = {"curve": {"kind": "svg", "role": "curve"},
                "dot": {"kind": "circle", "role": "marker"}}
    beat = lower(parse(raw, ["draw"]), {}, registry, "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    chart, dot = by_id["curve"], by_id["dot"]
    fraction = (dot["x"] - (chart["x"] - chart["width"] / 2)) / chart["width"]
    plotted = (fraction * 100 - 6) / 90
    assert abs(plotted - 0.25) < 0.02


def test_a_labelled_text_inside_a_labelled_host_moves_below_it():
    raw = ("beat 1\n@cue:draw\nshow body label=\"neuron body\" zone=center_mid\n"
           "show total label=\"0.7\" dock=inside:body\n")
    beat = lower(parse(raw, ["draw"]), {},
                 {"body": {"kind": "circle", "role": "body"},
                  "total": {"kind": "text", "role": "total"}}, "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    assert by_id["total"]["y"] < by_id["body"]["y"] - by_id["body"]["height"] / 2


def test_a_large_chart_can_jump_to_a_free_band_above_an_occupied_row():
    raw = ("beat 1\n@cue:draw\nshow node zone=center_mid\n"
           "chart curve type=line data=[0:0, 1:1] dock=right-of:node\n"
           "chart trace type=line data=[0:0, 1:1] dock=right-of:node\n")
    beat = lower(parse(raw, ["draw"]), {},
                 {"node": {"kind": "circle"}, "curve": {"kind": "svg"}, "trace": {"kind": "svg"}},
                 "N.", {"draw": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    chart, trace = by_id["curve"], by_id["trace"]
    assert (chart["x"], chart["y"]) != (trace["x"], trace["y"])
    separated = (abs(chart["x"] - trace["x"]) >= (chart["width"] + trace["width"]) / 2
                 or abs(chart["y"] - trace["y"]) >= (chart["height"] + trace["height"]) / 2)
    assert separated


def test_a_retained_connector_cannot_be_rewired_to_new_endpoints():
    import pytest
    from assistant.visual.plan import PlanError
    raw = ("beat 2\nretain a, b, c, edge\n@cue:x\nlink edge from=a to=c\n")
    state = {"a": {"id": "a", "kind": "box", "x": -2, "y": 0, "width": 2, "height": 1},
             "b": {"id": "b", "kind": "box", "x": 0, "y": 0, "width": 2, "height": 1},
             "c": {"id": "c", "kind": "box", "x": 2, "y": 0, "width": 2, "height": 1},
             "edge": {"id": "edge", "kind": "arrow", "from": "a", "to": "b",
                      "x": -1, "y": 0, "width": 2, "height": 0.2}}
    registry = {eid: {"kind": "box"} for eid in ("a", "b", "c")}
    registry["edge"] = {"kind": "arrow"}
    with pytest.raises(PlanError, match="do not rewire"):
        lower(parse(raw, ["x"]), state, registry, "N.", {"x": 0.4})


def test_a_one_anchor_shift_arrow_becomes_a_direction_glyph():
    raw = ("beat 1\n@cue:x\nshow bar zone=center_mid\n"
           "show shift dock=below:bar\n")
    registry = {"bar": {"kind": "box", "role": "result"},
                "shift": {"kind": "arrow", "role": "shift"}}
    beat = lower(parse(raw, ["x"]), {}, registry, "N.", {"x": 0.4})
    shift = next(e for e in beat["elements"] if e["id"] == "shift")
    assert shift["kind"] == "text" and shift["label"] == "↓"
    assert shift["y"] < beat["elements"][0]["y"]


def test_direction_overrides_the_dock_derived_glyph():
    raw = ("beat 1\n@cue:x\nshow bar zone=center_mid\n"
           "show shift dock=below:bar direction=up\n")
    registry = {"bar": {"kind": "box", "role": "result"},
                "shift": {"kind": "arrow", "role": "shift"}}
    beat = lower(parse(raw, ["x"]), {}, registry, "N.", {"x": 0.4})
    assert next(e for e in beat["elements"] if e["id"] == "shift")["label"] == "↑"


def test_a_connective_arrow_shown_without_endpoints_still_errors():
    import pytest
    from assistant.visual.plan import PlanError
    raw = ("beat 1\n@cue:x\nshow bar zone=center_mid\nshow edge dock=below:bar\n")
    registry = {"bar": {"kind": "box", "role": "result"},
                "edge": {"kind": "arrow", "role": "connection"}}
    with pytest.raises(PlanError, match="use `link edge"):
        lower(parse(raw, ["x"]), {}, registry, "N.", {"x": 0.4})


def test_an_axis_line_becomes_a_horizontal_guide_path():
    raw = ("beat 1\n@cue:x\nshow panel zone=center_mid\n"
           "show axis dock=inside:panel direction=horizontal\n")
    registry = {"panel": {"kind": "box", "role": "panel"},
                "axis": {"kind": "line", "role": "axis"}}
    beat = lower(parse(raw, ["x"]), {}, registry, "N.", {"x": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    axis = by_id["axis"]
    assert axis["kind"] == "path" and axis["points"] == [[-1, 0], [1, 0]]
    assert axis["width"] > axis["height"]
    assert (axis["x"], axis["y"]) == (by_id["panel"]["x"], by_id["panel"]["y"])


def test_an_axis_without_orientation_defaults_to_a_horizontal_level():
    raw = ("beat 1\n@cue:x\nshow panel zone=center_mid\nshow axis dock=inside:panel\n")
    registry = {"panel": {"kind": "box", "role": "panel"},
                "axis": {"kind": "line", "role": "axis"}}
    beat = lower(parse(raw, ["x"]), {}, registry, "N.", {"x": 0.4})
    assert next(e for e in beat["elements"] if e["id"] == "axis")["points"] == [[-1, 0], [1, 0]]


def test_a_label_beside_an_axis_marks_it_vertical():
    raw = ("beat 1\n@cue:x\nshow panel zone=center_mid\n"
           "show axis dock=inside:panel\n"
           "show label_text label=\"out\" dock=left-of:axis\n")
    registry = {"panel": {"kind": "box", "role": "panel"},
                "axis": {"kind": "line", "role": "axis"},
                "label_text": {"kind": "text", "role": "label"}}
    beat = lower(parse(raw, ["x"]), {}, registry, "N.", {"x": 0.4})
    assert next(e for e in beat["elements"] if e["id"] == "axis")["points"] == [[0, -1], [0, 1]]


def test_a_chart_can_fill_a_panel_even_when_it_is_larger():
    raw = ("beat 1\n@cue:x\nshow panel zone=right_mid\n"
           "chart curve type=line data=[0:0, 1:1] dock=inside:panel\n")
    registry = {"panel": {"kind": "box", "role": "panel"}, "curve": {"kind": "svg"}}
    beat = lower(parse(raw, ["x"]), {}, registry, "N.", {"x": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    assert (by_id["curve"]["x"], by_id["curve"]["y"]) == (by_id["panel"]["x"], by_id["panel"]["y"])


def test_plot_accepts_an_axis_equals_key_and_encoded_labels():
    raw = ("beat 1\n@cue:x\nchart curve type=line data=[z_m4:0.02, z_0:0.5, z_1:0.73] zone=center_mid\n"
           "plot dot on=curve at=z=1.0\n")
    registry = {"curve": {"kind": "svg", "role": "curve"},
                "dot": {"kind": "circle", "role": "marker"}}
    beat = lower(parse(raw, ["x"]), {}, registry, "N.", {"x": 0.4})
    by_id = {e["id"]: e for e in beat["elements"]}
    assert abs(by_id["dot"]["x"] - (by_id["curve"]["x"] + by_id["curve"]["width"] * 0.35)) < 0.4
