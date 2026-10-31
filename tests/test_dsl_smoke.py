import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bench.dsl_smoke import normalizations_needed, score  # noqa: E402

GOOD = """beat 3
retain token_row, context_vec
link proj_arrow from=context_vec to=dist_chart style=flow
@cue:project
  chart dist_chart type=bars data=[mat:0.62, floor:0.18] dock=right-of:context_vec
@cue:top_prob
  focus dist_chart item=mat
@cue:sample_draw
  show sampled_mat dock=below:dist_chart
@cue:append_tok
  move sampled_mat to=right-of:token_row duration=0.6
"""


def test_good_dsl_passes_every_criterion():
    result = score(GOOD)
    for name in ("criteria_1_no_prose", "criteria_2_cue_order", "criteria_3_link",
                 "criteria_4_sample_under_cue", "criteria_5_normalizations",
                 "criteria_6_cues_present", "criteria_7_no_forbidden"):
        assert result[name], (name, result["details"])


def test_prose_fences_and_coordinates_fail():
    bad = "Here is the block:\n```dsl\nbeat 3\n@start\nshow sample x=2 y=1\n```"
    result = score(bad)
    assert not result["criteria_1_no_prose"]
    assert not result["criteria_7_no_forbidden"]
    assert "fences" in result["details"]["normalizations"]


def test_camera_mention_does_not_count_as_the_sample_command():
    raw = ("beat 3\ncamera frame=[sampled_mat, dist_chart]\n@cue:project\n"
           "  chart dist_chart type=bars data=[mat:0.62]\n@cue:sample_draw\n"
           "  show sampled_mat dock=below:dist_chart\n")
    from bench.dsl_smoke import sampled_cue
    assert sampled_cue(raw) == "sample_draw"


def test_cue_alias_and_separator_normalizations_are_counted():
    raw = "beat 3\n@project\n  show dist_chart dock:right-of:context_vec\n"
    used = normalizations_needed(raw)
    assert "cue_alias" in used and "separators" in used
