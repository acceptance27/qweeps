"""Replay captured failing beats through the compiler without a model call."""
from __future__ import annotations

import glob
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from assistant.visual.plan import PlanError  # noqa: E402
from assistant.visual.v3 import compile_lesson  # noqa: E402


def replay(path: Path) -> tuple[bool, str]:
    data = json.loads(path.read_text())
    authoring = {"title": "Replay", "summary": "Replay",
                 "roleTable": data.get("roleTable", {}),
                 "beats": [data["beat"]]}
    try:
        result = compile_lesson(authoring, data.get("cueTimes", {}))
    except PlanError as exc:
        return False, f"{type(exc).__name__}: {exc}"
    beat = result["compiled"]["beats"][0]
    ids = {element["id"] for element in beat["elements"]}
    retained = []
    for item in (data.get("contract") or {}).get("retain", []):
        eid = item.get("id") if isinstance(item, dict) else item
        if isinstance(eid, str):
            retained.append(eid)
    missing = [eid for eid in retained if eid not in ids]
    if missing:
        return False, f"missing retained {missing}"
    return True, f"{len(beat['elements'])} elements"


def main() -> int:
    pattern = sys.argv[1] if len(sys.argv) > 1 else "/tmp/opencode/qweeps-capture/*.json"
    paths = sorted(glob.glob(pattern))
    if not paths:
        print("no captures")
        return 1
    failed = 0
    for raw in paths:
        ok, detail = replay(Path(raw))
        print(("OK  " if ok else "FAIL"), Path(raw).name, detail)
        failed += 0 if ok else 1
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
