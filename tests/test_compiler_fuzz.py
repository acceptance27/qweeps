import copy
import random

import pytest

from assistant.visual.plan import PlanError
from assistant.visual.v3 import compile_lesson

BASE = {
    "title": "T", "summary": "S",
    "beats": [{
        "title": "B", "narration": "N", "duration": 10,
        "elements": [
            {"id": "a", "kind": "box", "label": "A", "x": -2, "y": 0, "width": 2, "height": 1},
            {"id": "b", "kind": "text", "label": "B", "x": 2, "y": 0, "width": 2, "height": 0.5},
            {"id": "chart", "kind": "svg", "label": "P", "x": 0, "y": 1, "width": 4, "height": 1.5,
             "bars": [{"label": "x", "value": 0.6}, {"label": "y", "value": 0.2}]},
        ]}]
}


def compile_base():
    return copy.deepcopy(BASE)


@pytest.mark.parametrize("mutation", [
    lambda s: s["beats"][0]["elements"][2]["bars"][0].update({"value": "not-a-number"}),
    lambda s: s["beats"][0]["elements"].append({"id": "broken", "kind": "path", "label": "b"}),
    lambda s: s["beats"][0]["elements"].append({"id": "bad", "kind": "arrow", "from": "a", "to": "ghost"}),
    lambda s: s["beats"][0]["elements"][0].update({"x": 100, "height": 20}),
    lambda s: s["beats"][0]["elements"][0].update({"drawDuration": 0}),
    lambda s: s["beats"][0]["elements"][0].update({"x": "1.5", "width": "2"}),
    lambda s: s["beats"][0]["elements"][1].update({"id": "a"}),
])
def test_repairable_malformed_fields_still_compile(mutation):
    scene = compile_base()
    mutation(scene)
    result = compile_lesson(scene, {})
    assert result["compiled"]["beats"][0]["elements"]


@pytest.mark.parametrize("mutation", [
    lambda s: s["beats"][0].pop("elements"),
    lambda s: s["beats"][0]["elements"][0].pop("id"),
    lambda s: s["beats"][0]["elements"][0].update({"kind": "python"}),
    lambda s: s["beats"][0]["elements"][0].update({"semanticRole": "ghost"}),
])
def test_unrepairable_fields_raise_plan_error(mutation):
    scene = compile_base()
    mutation(scene)
    with pytest.raises(PlanError):
        compile_lesson(scene, {})
    if len(scene["beats"][0].get("elements", [])) == 1:
        scene["beats"][0]["elements"].append({"id": "a2", "kind": "box"})
        with pytest.raises(PlanError):
            compile_lesson(scene, {})


def test_random_mutations_never_crash_the_compiler():
    rng = random.Random(7)
    keys = ["x", "y", "width", "height", "opacity", "drawDuration", "revealAt",
            "kind", "label", "points", "bars", "from", "to", "semanticRole"]
    values = [None, -5, 0, 1e9, "x", "with:cue.missing", [], {}, True]
    for _ in range(200):
        scene = compile_base()
        element = rng.choice(scene["beats"][0]["elements"])
        key = rng.choice(keys)
        element[key] = rng.choice(values)
        try:
            compile_lesson(scene, {})
        except PlanError:
            pass
        except Exception as exc:  # noqa: BLE001 - fuzz must not hide crashes
            raise AssertionError(f"unexpected {type(exc).__name__} for {key}={element[key]!r}") from exc
