"""Deterministic Stage 1 gate for compiled scenes."""
from __future__ import annotations

from .geometry import occlusions, screen_box

ERROR_CLASSES = {"TEXT_OCCLUSION", "LABEL_OVERFLOW", "TIMING", "SYNC_VIOLATION",
                 "ROLE_STYLE", "CONTAINER_OVERFLOW", "BOUNDARY_INFEASIBLE",
                 "MISSING_EVIDENCE"}
CHAR_ADVANCE = 0.55  # world units per character at text height 1.0


def check_scene(scene: dict) -> dict:
    blockers, advisories = [], []
    for index, beat in enumerate(scene.get("beats", [])):
        camera = beat.get("camera", {"x": 0, "y": 0, "zoom": 1})
        elements = beat.get("elements", [])
        if len(elements) > 12:
            advisories.append({
                "beat": beat.get("id", f"beat_{index}"),
                "compiledId": None,
                "errorClass": "CLUTTER",
                "problem": f"{len(elements)} elements; consider grouping repeated items",
            })
        for element in elements:
            if element.get("kind") != "text":
                continue
            label = element.get("label", "")
            lines = element.get("lines") or [label]
            font = element.get("fontSize", element.get("height", 0.5))
            longest = max((len(line) for line in lines), default=0)
            estimate = longest * CHAR_ADVANCE * font
            if estimate > element.get("width", 2) * 1.1:
                blockers.append({
                    "beat": beat.get("id", f"beat_{index}"),
                    "compiledId": element.get("id"),
                    "errorClass": "LABEL_OVERFLOW",
                    "problem": f"estimated label width {estimate:.2f} exceeds box {element.get('width')}",
                })
        by_id = {element.get("id"): element for element in elements}
        for finding in occlusions(elements, camera):
            first, second = by_id.get(finding["a"]), by_id.get(finding["b"])
            if not first or not second:
                continue
            text = first if first.get("kind") == "text" else second if second.get("kind") == "text" else None
            other = second if text is first else first
            if text is None:
                continue
            text_box, other_box = screen_box(text, camera), screen_box(other, camera)
            text_area = (text_box[2] - text_box[0]) * (text_box[3] - text_box[1])
            other_area = (other_box[2] - other_box[0]) * (other_box[3] - other_box[1])
            contained = (text_box[0] >= other_box[0] - 2 and text_box[1] >= other_box[1] - 2
                         and text_box[2] <= other_box[2] + 2 and text_box[3] <= other_box[3] + 2)
            background = other_area > text_area * 3
            center_x = (text_box[0] + text_box[2]) / 2
            center_y = (text_box[1] + text_box[3]) / 2
            centered = (other_box[0] <= center_x <= other_box[2]
                        and other_box[1] <= center_y <= other_box[3])
            finding_row = {
                "beat": beat.get("id", f"beat_{index}"),
                "compiledId": finding["a"],
                "problem": f"{finding['a']} overlaps {finding['b']} by {finding['ratio']:.0%}",
            }
            if other.get("kind") == "text":
                target = blockers if finding["ratio"] >= 0.5 else advisories
                target.append({**finding_row, "errorClass": "TEXT_OCCLUSION"})
            elif contained or background or centered:
                advisories.append({**finding_row, "errorClass": "TEXT_ON_FIELD"})
            else:
                target = blockers if finding["ratio"] >= 0.5 else advisories
                target.append({**finding_row, "errorClass": "TEXT_OCCLUSION"})
        teaching = beat.get("teaching")
        if teaching:
            ids = {element.get("id") for element in elements}
            for evidence in teaching.get("evidence", []):
                if evidence not in ids:
                    blockers.append({
                        "beat": beat.get("id", f"beat_{index}"),
                        "compiledId": evidence,
                        "errorClass": "MISSING_EVIDENCE",
                        "problem": "teaching evidence is not present in the compiled beat",
                    })
    return {"approved": not blockers, "blockers": blockers, "advisories": advisories}
