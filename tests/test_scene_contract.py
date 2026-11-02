"""Acceptance and unit tests for the Scene Direction Contract pipeline (Phases 1-6)."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile

import pytest

from assistant.visual.plan import PlanError
from assistant.visual.scene_contract import (
    ACT1_ASCII_BLUEPRINT,
    EV_ASCII_BLUEPRINT,
    CardParts,
    aabb_metrics,
    ascii_to_scene_contract,
    assemble_contract_scene,
    emit_manim_skeleton,
    ev_hybrid_lesson_plan,
    ev_scene_contract,
    ev_slot_fill,
    low_reasoning_contract_prompt,
    rizal_act1_contract,
    rizal_act1_slot_fill,
    stretch_and_remap_contract,
    validate_card_parts,
    validate_filled_ast,
    validate_scene_contract,
)


VISUAL_PYTHON = Path.home() / ".local/share/omarchy-assistant/visual-venv/bin/python"
REPO_ROOT = Path(__file__).resolve().parents[1]


def _run_visual_python(script: str) -> dict:
    env = {**os.environ, "PYTHONPATH": str(REPO_ROOT / "src")}
    res = subprocess.run(
        [str(VISUAL_PYTHON), "-c", script],
        capture_output=True,
        text=True,
        timeout=180,
        env=env,
    )
    assert res.returncode == 0, f"visual-venv failed:\nSTDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}"
    lines = [line.strip() for line in res.stdout.splitlines() if line.strip().startswith("{")]
    return json.loads(lines[-1]) if lines else {}


# ---------------------------------------------------------------------------
# Phase 1: Contract schema, ASCII compiler, and pre-TTS / post-sync validator
# ---------------------------------------------------------------------------


def test_act1_and_ev_contracts_validate_zero_errors_pre_tts():
    act1_from_ascii = ascii_to_scene_contract(ACT1_ASCII_BLUEPRINT)
    act1_canonical = rizal_act1_contract()
    ev_from_ascii = ascii_to_scene_contract(EV_ASCII_BLUEPRINT)
    ev_canonical = ev_scene_contract()

    assert validate_scene_contract(act1_from_ascii) == []
    assert validate_scene_contract(act1_canonical) == []
    assert validate_scene_contract(ev_from_ascii) == []
    assert validate_scene_contract(ev_canonical) == []
    assert act1_canonical["duration"] == 52.0
    assert len(act1_canonical["beats"]) == 4
    assert act1_canonical["persistent"] == ["timeline_anchor"]
    assert act1_canonical["persistent_exit"]["timeline_anchor"]["at"] == 50.5


def test_validator_catches_lifecycle_leaks_carry_focal_cap_and_transform_ban():
    bad = rizal_act1_contract()
    # 1. Persistent leak: remove persistent_exit
    bad["persistent_exit"] = {}
    # 2. Focal lifecycle leak: calamba_card neither exits nor carries out in b1
    bad["beats"][0]["exit"] = []
    # 3. Carry mismatch: b2 carried_in does not match b1 carried_out
    bad["beats"][1]["carried_in"] = ["nonexistent_carry"]
    # 4. Focal cap breach: add 4 focal objects to b1
    bad["beats"][0]["enter"] = ["luzon_locator", "calamba_card", "extra_a", "extra_b"]
    bad["beats"][0]["zone_bindings"]["extra_a"] = "right_top"
    bad["beats"][0]["zone_bindings"]["extra_b"] = "right_bottom"
    # 5. Text-different TransformFromCopy ban in b3
    bad["beats"][2]["transforms"][0]["type"] = "TransformFromCopy"

    errors = validate_scene_contract(bad)
    codes = {e["code"] for e in errors}
    assert "persistent-leak" in codes
    assert "lifecycle-leak" in codes
    assert "carry-mismatch" in codes
    assert "focal-cap-breach" in codes
    assert "text-transform-ban" in codes


# ---------------------------------------------------------------------------
# Tightener 1 (Acceptance Test 1): Typed CardParts validation rejects glow-at-0
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not VISUAL_PYTHON.is_file(), reason="visual-venv not installed")
def test_card_parts_validation_rejects_glow_at_index_0_and_accepts_typed_card():
    result = _run_visual_python(
        """
import json
from assistant.visual.recorded_scene import Circle, RoundedRectangle, Text, VGroup
from assistant.visual.scene_contract import CardParts, composite_card_transform, validate_card_parts

glow = Circle(radius=1.5).set_fill("#f7d154", opacity=0.15).set_stroke(width=0)
frame = RoundedRectangle(width=4.5, height=3.0, corner_radius=0.2)
label = Text("Mercado", font_size=28)
legacy_vgroup_card = VGroup(glow, frame, label)

rejected_vgroup = False
try:
    validate_card_parts(legacy_vgroup_card, object_id="mercado_badge", zone="right_zone")
except ValueError as exc:
    rejected_vgroup = "CardParts" in str(exc) and "index-0" in str(exc)

glow_frame = RoundedRectangle(width=4.5, height=3.0).set_fill("#f7d154", opacity=0.12).set_stroke(width=0)
rejected_glow_frame = False
try:
    validate_card_parts(CardParts(frame=glow_frame, text=VGroup(label)), object_id="mercado_badge", zone="right_zone")
except ValueError as exc:
    rejected_glow_frame = "glow/shadow" in str(exc)

rejected_empty_text = False
try:
    validate_card_parts(CardParts(frame=frame, text=VGroup()), object_id="mercado_badge", zone="right_zone")
except ValueError as exc:
    rejected_empty_text = "non-empty VGroup" in str(exc)

src = CardParts(
    frame=RoundedRectangle(width=4.5, height=3.0, corner_radius=0.2),
    text=VGroup(Text("Mercado", font_size=28)),
    extras=VGroup(Circle(radius=0.1)),
)
dst = CardParts(
    frame=RoundedRectangle(width=4.5, height=3.0, corner_radius=0.2),
    text=VGroup(Text("Rizal", font_size=28)),
    extras=VGroup(Circle(radius=0.12)),
)
validate_card_parts(src, object_id="mercado_badge", zone="right_zone")
anim = composite_card_transform(src, dst)
print(json.dumps({
    "rejected_vgroup": rejected_vgroup,
    "rejected_glow_frame": rejected_glow_frame,
    "rejected_empty_text": rejected_empty_text,
    "anim_parts": len(anim.animations),
}))
"""
    )
    assert result["rejected_vgroup"] is True
    assert result["rejected_glow_frame"] is True
    assert result["rejected_empty_text"] is True
    assert result["anim_parts"] == 4


# ---------------------------------------------------------------------------
# Tightener 2 (Acceptance Test 2): right_top/right_bottom vs right_zone collision
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not VISUAL_PYTHON.is_file(), reason="visual-venv not installed")
def test_two_objects_in_right_top_and_right_bottom_pass_while_two_in_right_zone_fail():
    # Contract-level check: two active objects sharing right_zone fails pre-TTS validation
    bad_contract = rizal_act1_contract()
    bad_contract["beats"][1]["zone_bindings"]["gomburza_triad"] = "right_zone"
    bad_contract["beats"][1]["zone_bindings"]["paciano_link"] = "right_zone"
    contract_errors = validate_scene_contract(bad_contract)
    assert any(e["code"] == "zone-slot-collision" for e in contract_errors)

    # Runtime AABB check after CE text metrics in visual-venv
    result = _run_visual_python(
        """
import copy, json
from assistant.visual.recorded_scene import RecordedScene, RoundedRectangle, Text, VGroup
from assistant.visual.scene_contract import aabb_metrics, audit_contract_scene, rizal_act1_contract

class SplitSlotScene(RecordedScene):
    def construct(self):
        self.beat("b2", "Split slots")
        top_obj = VGroup(RoundedRectangle(width=4.8, height=1.6), Text("Gomburza Triad", font_size=26))
        bot_obj = VGroup(RoundedRectangle(width=4.8, height=1.6), Text("Paciano Link", font_size=26))
        self.place_in_zone(top_obj, "right_top")
        self.place_in_zone(bot_obj, "right_bottom")
        self.bind("gomburza_triad", top_obj, zone="right_top")
        self.bind("paciano_link", bot_obj, zone="right_bottom", kind="mobject")
        self.wait(2.0)

good = SplitSlotScene()
b_top = good.bound_objects["gomburza_triad"].get_bounding_box()
b_bot = good.bound_objects["paciano_link"].get_bounding_box()
metrics_good = aabb_metrics(
    [b_top[0][0], b_top[0][1], b_top[2][0], b_top[2][1]],
    [b_bot[0][0], b_bot[0][1], b_bot[2][0], b_bot[2][1]],
)

bad_contract = rizal_act1_contract()
bad_contract["beats"] = [copy.deepcopy(bad_contract["beats"][1])]
bad_contract["beats"][0]["zone_bindings"]["gomburza_triad"] = "right_zone"
bad_contract["beats"][0]["zone_bindings"]["paciano_link"] = "right_zone"

class SharedZoneScene(RecordedScene):
    CONTRACT = bad_contract
    def construct(self):
        t_anchor = VGroup(Text("1861 - 1882", font_size=24))
        self.place_in_zone(t_anchor, "timeline_zone")
        self.bind("timeline_anchor", t_anchor, zone="timeline_zone")
        self.beat("b2", "Shared right_zone")
        luz = VGroup(RoundedRectangle(width=4.0, height=3.0), Text("Luzon", font_size=26))
        top_obj = VGroup(RoundedRectangle(width=4.8, height=2.0), Text("Gomburza", font_size=26))
        bot_obj = VGroup(RoundedRectangle(width=4.8, height=2.0), Text("Paciano", font_size=26))
        self.place_in_zone(luz, "left_zone")
        self.place_in_zone(top_obj, "right_zone")
        self.place_in_zone(bot_obj, "right_zone")
        self.bind("luzon_locator", luz, zone="left_zone")
        self.bind("gomburza_triad", top_obj, zone="right_zone")
        self.bind("paciano_link", bot_obj, zone="right_zone", kind="mobject")
        self.play(luz, top_obj, bot_obj, run_time=1.0)
        self.wait(3.0)
        self.reset_scene()

bad = SharedZoneScene()
findings = audit_contract_scene(bad, bad_contract)
print(json.dumps({
    "good_collides": bool(metrics_good["collides"]),
    "good_gap_y": round(float(metrics_good["gap_y"]), 3),
    "bad_codes": [f["code"] for f in findings],
    "bad_fields": [f.get("field") for f in findings if f["code"] == "aabb-collision"],
}))
"""
    )
    assert result["good_collides"] is False
    assert result["good_gap_y"] >= 0.35
    assert "aabb-collision" in result["bad_codes"]
    assert "gomburza_triad,paciano_link" in result["bad_fields"]


# ---------------------------------------------------------------------------
# Tightener 3 (Acceptance Tests 3 & 4): Elastic duration stretch, remap, cap
# ---------------------------------------------------------------------------


def test_tts_0_8s_over_budget_stretches_beat_shifts_cues_and_passes_post_sync():
    contract = rizal_act1_contract()
    # Beat 1 target is 13.0s (hold=2.0, exit=0.8 -> speech budget 10.2s).
    # Give TTS 11.0s (0.8s over budget -> actual_duration = 11.0 + 2.0 + 0.8 = 13.8s, stretch = 1.0615 <= 1.20).
    speech_durations = {
        "b1": 11.0,
        "b2": 9.5,
        "b3": 9.8,
        "b4": 9.5,
    }
    updated, post_sync = stretch_and_remap_contract(contract, speech_durations)
    assert updated["beats"][0]["actual_duration"] == pytest.approx(13.8)
    assert post_sync["total_delta"] == pytest.approx(0.8)
    # Subsequent beat b2 start offset shifted by +0.8s (from 13.0 to 13.8)
    assert post_sync["beats"][1]["start"] == pytest.approx(13.8)
    # Subsequent cue timestamps shifted by +0.8s (14.2 -> 15.0, 15.6 -> 16.4)
    b2_cues = {c["target"]: c["at"] for c in updated["beats"][1]["actual_cues"]}
    assert b2_cues["gomburza_triad"] == pytest.approx(15.0)
    assert b2_cues["paciano_link"] == pytest.approx(16.4)
    # Native map holds final scene frame for the extra 0.8s without rebuilding the Manim scene
    b1_native_map = post_sync["beats"][0]["nativeMap"]
    assert b1_native_map[-2] == {"at": 13.0, "scene": 13.0}
    assert b1_native_map[-1] == {"at": 13.8, "scene": 13.0}
    # Post-sync validation passes with zero errors
    assert validate_scene_contract(updated, post_sync=post_sync) == []


def test_tts_30_percent_over_budget_condenses_or_fails():
    contract = rizal_act1_contract()
    # 30% over budget on b1: target=13.0, actual = 14.5 + 2.0 + 0.8 = 17.3s (1.33x > 1.20x cap = 15.60s)
    over_speech = {"b1": 14.5, "b2": 9.5, "b3": 9.5, "b4": 9.5}

    # Without condense_fn -> fails with PlanError rather than stretching forever
    with pytest.raises(PlanError, match="exceeding max_stretch ceiling 15.60s"):
        stretch_and_remap_contract(contract, over_speech)

    # With a condense_fn that brings speech within the 1.20x cap -> condenses once and passes
    called = []

    def condense_once(bid: str, max_speech: float, beat: dict):
        called.append((bid, max_speech))
        return {
            "narration": "José Rizal grows up in Calamba under Dominican leasehold.",
            "speech_duration": 10.2,
        }

    updated, post_sync = stretch_and_remap_contract(contract, over_speech, condense_fn=condense_once)
    assert called == [("b1", 12.8)]
    assert post_sync["condensed_beats"] == ["b1"]
    assert updated["beats"][0]["actual_duration"] == pytest.approx(13.0)
    assert validate_scene_contract(updated, post_sync=post_sync) == []


# ---------------------------------------------------------------------------
# Phase 2, 3, 4 & Acceptance Tests 5 & 6: AST lock, audit, roles, low vs high
# ---------------------------------------------------------------------------


def test_ast_validator_rejects_undeclared_objects_and_forbidden_lifecycle_calls():
    contract = rizal_act1_contract()
    bad_fill = rizal_act1_slot_fill("low") + "\n\ndef build_invented_widget(self):\n    return VGroup()\n"
    findings = validate_filled_ast(bad_fill, contract)
    assert any(f["code"] == "undeclared-object-method" and f["field"] == "build_invented_widget" for f in findings)

    forbidden_fill = rizal_act1_slot_fill("low").replace(
        "self.play(Indicate(luzon_locator, scale_factor=1.03), run_time=1.0)",
        "self.cue('luzon_locator', luzon_locator)\n    self.play(FadeOut(luzon_locator))",
    )
    findings2 = validate_filled_ast(forbidden_fill, contract)
    assert len(findings2) >= 2
    assert all(f["code"] == "forbidden-lifecycle-call" for f in findings2)


@pytest.mark.skipif(not VISUAL_PYTHON.is_file(), reason="visual-venv not installed")
def test_compile_audit_and_role_binding_for_act1_and_ev_low_and_high():
    from assistant.visual.native_author import compile_source, generate_contract_scene

    interp = str(VISUAL_PYTHON)

    for name, contract_fn, fill_fn in [
        ("rizal_act1", rizal_act1_contract, rizal_act1_slot_fill),
        ("ev_powertrain", ev_scene_contract, ev_slot_fill),
    ]:
        for effort in ("low", "high"):
            with tempfile.TemporaryDirectory() as tmp:
                folder = Path(tmp)
                contract = contract_fn()
                code = assemble_contract_scene(fill_fn(effort), contract)
                src = folder / f"{name}_{effort}.py"
                src.write_text(code)
                compiled = compile_source(interp, src, folder)
                # Acceptance 5 & 6: zero focal/persistent leaks and identical structural pass at low & high
                assert compiled["audit"] == []
                assert sorted(compiled["roles"]) == sorted(compiled["boundIds"])

    # Verify Phase 4 role clickability & metadata on Rizal Act I inside visual-venv
    meta_check = _run_visual_python(
        """
import json, tempfile
from pathlib import Path
from assistant.visual.ce_native import load_native_scene
from assistant.visual.scene_contract import assemble_contract_scene, rizal_act1_contract, rizal_act1_slot_fill

with tempfile.TemporaryDirectory() as tmp:
    src = Path(tmp) / "act1_low.py"
    src.write_text(assemble_contract_scene(rizal_act1_slot_fill("low"), rizal_act1_contract()))
    scene = load_native_scene(src)
    scene.evaluate(3.0, [], None)
    meta_b1 = scene.metadata(3.0)
    roles_b1 = sorted({b["dataRole"] for b in meta_b1["bounds"]})
    scene.evaluate(52.0, [], None)
    meta_end = scene.metadata(52.0)
    print(json.dumps({
        "roles_b1": roles_b1,
        "bounds_end": meta_end["bounds"],
    }))
"""
    )
    assert "calamba_card" in meta_check["roles_b1"]
    assert "luzon_locator" in meta_check["roles_b1"]
    assert "timeline_anchor" in meta_check["roles_b1"]
    assert meta_check["bounds_end"] == []

    # Verify repair loop in generate_contract_scene fixes an initial overflow/font error
    class MockRepairLLM:
        def __init__(self):
            self.prompts = []

        def compose(self, prompt, system="", max_tokens=24000, reasoning_effort="low"):
            self.prompts.append((reasoning_effort, prompt))
            if len(self.prompts) == 1:
                # Return a broken fill with font_size=14 (< 24 floor) on calamba_card
                return rizal_act1_slot_fill("low").replace("font_size=24", "font_size=14")
            return rizal_act1_slot_fill("low")

    with tempfile.TemporaryDirectory() as tmp:
        llm = MockRepairLLM()
        manifest = generate_contract_scene(llm, rizal_act1_contract(), interp, Path(tmp), reasoning_effort="low")
        assert manifest["repairsUsed"] == 1
        assert len(llm.prompts) == 2
        # Repair prompt received exact failing field and zone
        assert "field=calamba_card" in llm.prompts[1][1]
        assert "zone=right_zone" in llm.prompts[1][1]


def test_ev_hybrid_lesson_plan_combines_native_and_layout_beats():
    plan = ev_hybrid_lesson_plan()
    assert plan["native_beats"] == ["battery_flow", "motor_drive"]
    assert plan["layout_beats"] == ["power_intro", "regen_braking", "charging_steps", "efficiency_recall"]
    assert validate_scene_contract(plan["native_contract"]) == []


def test_p_vs_np_20beat_contract_parallel_act_chunking_and_surgical_repair():
    from assistant.visual.scene_contract import (
        act_chunk_prompt,
        chunk_contract_by_act,
        extract_slot_methods,
        merge_slot_methods,
        p_vs_np_20beat_contract,
        surgical_repair_prompt,
    )

    contract = p_vs_np_20beat_contract()
    assert len(contract["beats"]) == 20
    assert contract["duration"] == pytest.approx(240.0)
    assert validate_scene_contract(contract) == []

    # Post-sync validation on all 20 beats
    speech = {b["id"]: round(float(b["narration_words"]) / 2.5, 2) for b in contract["beats"]}
    remapped, post_sync = stretch_and_remap_contract(contract, speech)
    assert validate_scene_contract(remapped, post_sync=post_sync) == []

    # 4 parallel 5-beat Act chunks cover all 20 beats and 41 objects cleanly
    chunks = chunk_contract_by_act(contract, chunk_size=5)
    assert len(chunks) == 4
    assert [len(c["beats"]) for c in chunks] == [5, 5, 5, 5]
    all_chunk_objs = [o["id"] for c in chunks for o in c["objects"]]
    assert len(all_chunk_objs) == len(set(all_chunk_objs)) == 41
    for ch in chunks:
        prompt = act_chunk_prompt(contract, ch)
        assert f"Act {ch['act_index']}" in prompt

    # Surgical repair prompt + merge_slot_methods replaces only the failing method
    act1 = rizal_act1_contract()
    base_code = rizal_act1_slot_fill("high")
    methods = extract_slot_methods(base_code, contract=act1)
    broken_calamba = methods["build_calamba_card"].replace("font_size=24", "font_size=14", 1)
    broken_code = merge_slot_methods(base_code, broken_calamba, contract=act1)
    audit = [{
        "code": "font-size-violation",
        "field": "calamba_card",
        "zone": "right_zone",
        "detail": "Text font_size=14 in build_calamba_card is below min_font_size=24",
    }]
    s_prompt = surgical_repair_prompt(act1, broken_code, audit)
    assert "SURGICAL SLOT REPAIR" in s_prompt
    assert "build_calamba_card" in s_prompt
    assert "build_gomburza_triad" not in s_prompt

    # Patch containing ONLY the single repaired method
    single_method_patch = methods["build_calamba_card"]
    repaired_code = merge_slot_methods(broken_code, single_method_patch, contract=act1)
    assert validate_filled_ast(repaired_code, act1) == []
    assert len(extract_slot_methods(repaired_code, contract=act1)) == len(methods) == 13

