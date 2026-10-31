import pytest

from assistant.visual.dsl import authoring_id, generated_for, generated_id, is_generated, provenance
from assistant.visual.timing import TimingError, check_cue_window, expand_loops, parse, resolve


def test_generated_ids_are_selector_safe():
    value = generated_id(2, "next-token", "label 1")
    assert value == "b2__gen__next_token__label_1"
    assert is_generated(value)
    assert generated_for(2, "next-token", value)
    assert not generated_for(3, "next-token", value)


def test_authoring_ids_cannot_impersonate_generated_nodes():
    assert authoring_id("sample-arrow")
    assert not authoring_id("b2__gen__chart__l0")
    assert not authoring_id("1leading")
    assert not authoring_id("has.dot")


def test_provenance_recovers_the_sanitized_parent():
    assert provenance("b2__gen__next_token__label_1") == {"beat": 2, "authoringId": "next_token"}


def test_parse_supports_cue_element_and_pass_forms():
    assert parse("with:cue.draw")["kind"] == "cue"
    assert parse("after:cue.draw+0.2")["offset"] == 0.2
    assert parse("after:el.wire.end+0.1")["edge"] == "end"
    assert parse("with:pass.loop[1].start")["index"] == 1
    assert parse(1.5)["value"] == 1.5


def test_resolve_lowers_cue_and_element_dependencies():
    times = resolve(
        [{"id": "a", "revealAt": "with:cue.draw", "drawDuration": 1.0},
         {"id": "b", "revealAt": "after:el.a.end+0.2", "drawDuration": 0.5},
         {"id": "c", "revealAt": "with:cue.next+0.1", "drawDuration": 0.3}],
        {"draw": 2.0, "next": 5.0})
    assert times["a"]["start"] == 2.0 and times["a"]["end"] == 3.0
    assert times["b"]["start"] == 3.2 and times["b"]["end"] == 3.7
    assert times["c"]["start"] == 5.1


def test_cycle_and_dangling_anchors_are_rejected():
    with pytest.raises(TimingError, match="cyclic"):
        resolve([{"id": "a", "revealAt": "after:el.b.end"},
                 {"id": "b", "revealAt": "after:el.a.end"}], {})
    with pytest.raises(TimingError, match="unknown element"):
        resolve([{"id": "a", "revealAt": "after:el.ghost.end"}], {})
    with pytest.raises(TimingError, match="unknown cue"):
        resolve([{"id": "a", "revealAt": "with:cue.missing"}], {})


def test_effect_roles_require_a_causal_anchor():
    with pytest.raises(TimingError, match="must declare a cue/element anchor"):
        resolve([{"id": "out", "semanticRole": "sampled_output", "revealAt": 0.0}], {})
    times = resolve([{"id": "out", "semanticRole": "sampled_output",
                      "revealAt": "after:cue.sample+0.2"}], {"sample": 3.0})
    assert times["out"]["start"] == 3.2


def test_loops_expand_to_concrete_pass_intervals():
    passes = expand_loops([{"id": "autoreg", "t_start": "with:cue.go", "passes": 2,
                            "passDuration": 1.5}], {"go": 2.0})
    assert passes["autoreg"] == [(2.0, 3.5), (3.5, 5.0)]
    times = resolve([{"id": "token", "revealAt": "with:pass.autoreg[1].start"}], {}, passes)
    assert times["token"]["start"] == 3.5
    with pytest.raises(TimingError, match="unknown loop pass"):
        resolve([{"id": "token", "revealAt": "with:pass.autoreg[2].start"}], {}, passes)


def test_cue_window_uses_half_the_next_cue_gap():
    assert check_cue_window(0.2, 0.0, 1.0) is None
    assert check_cue_window(0.6, 0.0, 1.0) is not None
    assert check_cue_window(-0.2, 0.0, 1.0) is not None
    assert check_cue_window(1.0, 0.0, None) is not None


def test_hyphenated_cues_spaces_and_at_alias_are_accepted():
    assert parse("with:cue.two-numbers-one-answer")["name"] == "two-numbers-one-answer"
    assert parse("after:cue.draw + 0.2")["offset"] == 0.2
    assert parse("at:cue.draw")["kind"] == "cue"
    assert parse("at:element.wire.end")["edge"] == "end"
    times = resolve([{"id": "a", "revealAt": "with:cue.two-numbers-one-answer"}],
                    {"two-numbers-one-answer": 1.2})
    assert times["a"]["start"] == 1.2


def test_short_element_and_cue_anchors_resolve():
    times = resolve([{"id": "a", "revealAt": 1.0, "drawDuration": 0.5},
                     {"id": "b", "revealAt": "with:a"},
                     {"id": "c", "revealAt": "after:a"}], {"cue": 4.0})
    assert times["b"]["start"] == 1.0
    assert times["c"]["start"] == 1.5
    cues = resolve([{"id": "a", "revealAt": "with:cue"}], {"cue": 4.0})
    assert cues["a"]["start"] == 4.0


def test_numeric_string_draw_duration_is_coerced():
    times = resolve([{"id": "a", "revealAt": 0, "drawDuration": "0.5"}], {})
    assert times["a"]["end"] == 0.5


def test_loop_anchored_to_an_element_falls_back_to_the_cue_floor():
    passes = expand_loops([{"id": "scale", "t_start": "after:el.setup.end",
                            "passes": 2, "passDuration": 1.0}], {})
    assert passes["scale"] == [(0.4, 1.4), (1.4, 2.4)]
    assert issubclass(TimingError, __import__("assistant.visual.plan", fromlist=["PlanError"]).PlanError)


def test_non_positive_draw_durations_are_repaired_during_lowering():
    times = resolve([{"id": "a", "revealAt": 0, "drawDuration": 0},
                     {"id": "b", "revealAt": 0, "drawDuration": -4}], {})
    assert times["a"]["drawDuration"] == 0.5
    assert times["b"]["drawDuration"] == 0.5


def test_dotted_subpath_anchors_resolve_the_head():
    assert parse("with:inputs.row")["name"] == "inputs"
    times = resolve([{"id": "inputs", "revealAt": 1.0},
                     {"id": "row", "revealAt": "with:inputs.row"}], {})
    assert times["row"]["start"] == 1.0
