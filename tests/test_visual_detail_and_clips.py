import pytest

from assistant.visual.detail_contract import DETAIL_LEVELS, detail_contract, with_detail
from assistant.visual.manim_clips import CLIPS, clip_chapter, clip_path, source_sha
from assistant.visual.plan import PLAN_PROMPT


def test_detail_levels_are_distinct_and_budgeted():
    texts = {level: detail_contract(level) for level in DETAIL_LEVELS}
    assert len(set(texts.values())) == 3
    assert "HIGH" in texts["high"] and "beats" in texts["high"]


def test_detail_env_override(monkeypatch):
    monkeypatch.setenv("QWEEPS_VISUAL_DETAIL", "low")
    assert "LOW" in detail_contract()


def test_with_detail_is_idempotent():
    once = with_detail("planner", "high")
    assert with_detail(once, "low") == once


def test_plan_prompt_carries_the_contract():
    assert "Visual detail contract" in PLAN_PROMPT
    assert "new inference" in PLAN_PROMPT


def test_clip_registry_resolves_source():
    spec = CLIPS["pair_production"]
    assert spec.source.is_file()
    assert spec.scene == "GenScene"
    assert spec.duration > 0
    assert len(source_sha(spec)) == 16


def test_clip_chapter_uses_the_shared_clock():
    spec = CLIPS["pair_production"]
    chapter = clip_chapter("pair_production", start=12.5, renderer="gl")
    assert chapter["engine"] == "manim"
    assert chapter["renderer"] == "gl"
    assert chapter["start"] == 12.5
    assert chapter["end"] == round(12.5 + spec.duration, 2)
    assert chapter["video"].endswith(f"pair_production-gl-{source_sha(spec)}.mp4")


def test_clip_cache_path_is_content_addressed():
    spec = CLIPS["pair_production"]
    path = clip_path("pair_production", "ce")
    assert spec.name in str(path)
    assert source_sha(spec) in str(path)
    assert path.name == "lesson.mp4"


def test_unknown_clip_is_rejected():
    with pytest.raises(KeyError):
        clip_path("does_not_exist", "gl")


def test_pair_production_is_split_into_beats():
    beats = ["pair_production_photon", "pair_production_creation", "pair_production_ledger"]
    for name in beats:
        spec = CLIPS[name]
        assert spec.source.is_file()
        assert spec.scene in {"PairPhoton", "PairCreation", "PairLedger"}
        assert 6 <= spec.duration <= 12
    assert sum(CLIPS[name].duration for name in beats) > 20


def test_white_blood_cell_clip_is_registered():
    spec = CLIPS["white_blood_cell"]
    assert spec.source.is_file()
    assert spec.scene == "GenScene"
    assert spec.duration > 20
