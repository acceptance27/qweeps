import json

from assistant.telemetry import call_record, estimate_tokens
from assistant.visual.judge import blind_scene, judge
from assistant.visual.plan import PlanError


def test_token_estimate_is_labelled():
    estimate = estimate_tokens("How do LLMs work?")
    assert estimate["count"] > 0
    assert estimate["method"] in {"o200k_base", "chars/4"}


def test_call_record_carries_mode_clock_and_estimate():
    row = call_record(mode="ask", clock="synthetic", route="opencode-go",
                      model="opencode-go/deepseek-v4.1-flash", wall=12.345,
                      calls=3, outcome="failed", prompt="p", response="r",
                      judge_model="opencode-go/deepseek-v4.1-flash")
    assert row["wall_s"] == 12.35
    assert row["mode"] == "ask" and row["clock"] == "synthetic"
    assert row["tokenizer_est"]["in"]["count"] > 0
    assert "not a complete denominator" in row["tokenizer_est"]["label"]
    assert row["provider_tokens"] is None


def test_blind_scene_strips_identity_and_self_review():
    scene = {"id": "generated", "title": "T", "summary": "S",
             "generation": {"model": "deepseek", "provider": "opencode"},
             "teaching": {"review": {"approved": True}},
             "beats": [{"title": "B", "narration": "N", "elements": [{"id": "a"}],
                        "teaching": {"planBeat": "b1"}}]}
    clean = blind_scene(scene)
    assert "generation" not in clean and "teaching" not in clean
    assert clean["beats"][0]["elements"] == [{"id": "a"}]
    assert "teaching" not in clean["beats"][0]


def test_judge_rejects_approval_with_blockers():
    def chat(system, user):
        return json.dumps({"approved": True,
                           "blockers": [{"beat": "b1", "problem": "p"}],
                           "advisories": []})
    try:
        judge({"title": "T", "summary": "S", "beats": []}, chat)
    except PlanError as exc:
        assert "approved with blockers" in str(exc)
    else:
        raise AssertionError("expected PlanError")


def test_judge_returns_tiers():
    def chat(system, user):
        return json.dumps({"approved": False,
                           "blockers": [{"beat": "b1", "problem": "p", "revision": "r"}],
                           "advisories": [{"beat": "b2", "problem": "a"}]})
    result = judge({"title": "T", "summary": "S", "beats": []}, chat)
    assert result["approved"] is False
    assert len(result["blockers"]) == 1 and len(result["advisories"]) == 1


def test_capture_and_replay_roundtrip(tmp_path, monkeypatch):
    import sys
    from pathlib import Path

    from assistant.visual.v3_pipeline import _capture

    monkeypatch.setenv("QWEEPS_CAPTURE_DIR", str(tmp_path))
    _capture({"beat": {"title": "B", "narration": "N", "duration": 6, "elements": [
                  {"id": "a", "kind": "box", "label": "A"}]},
              "contract": {}, "roleTable": {}, "cueTimes": {}, "boundary": None,
              "error": "synthetic"})
    files = list(tmp_path.glob("failure-*.json"))
    assert len(files) == 1
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from bench.replay import replay
    ok, detail = replay(files[0])
    assert ok, detail
