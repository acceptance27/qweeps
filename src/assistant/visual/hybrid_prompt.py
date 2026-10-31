"""Prompt for the hybrid slot planner.

The model chooses chapters, layouts and slots, and may author bounded artwork in
the 0–100 node space. It never emits world coordinates.
"""
from __future__ import annotations

import json

SYSTEM = ("You are QWEEPS' visual lesson planner. Return one JSON object only. "
          "No prose, no markdown, no coordinates outside the node artwork space.")

SCHEMA = """{
 "title": "short lesson title",
 "question": "the learner question",
 "representation": "one paragraph on the visual method",
 "example": {"title": "worked example", "description": "one or two sentences", "icon": "cpu"},
 "chapters": [{
   "id": "stable-chapter-id",
   "title": "short chapter title",
   "question": "the question this chapter answers",
   "insight": "the inference the learner should make",
   "safeguard": "the misreading to prevent",
   "narration": "2–5 sentences, spoken while the chapter plays",
   "teaching": "construction|mechanism|quantitative|comparison|procedure|algorithm|narrative|recall",
   "layout": "process|fanin|diagram|matrix|timeline|comparison|concept|loci",
   "slots": [{
     "slot": "stable-slot-id",
     "title": "short node title",
     "body": "one or two sentences shown under the title",
     "icon": "one catalog icon id",
     "color": "blue|gold|green|coral|purple",
     "tag": "short formula or value",
     "at": 2,
     "template": "weight-dial|sum-node|number-line|sigmoid-plot|vote-bar|output-ring",
     "data": {"...": "template fields"},
     "artwork": [{"type": "circle", "cx": 50, "cy": 40, "r": 22, "stroke": "blue"},
                 {"type": "text", "x": 50, "y": 70, "size": 9, "fill": "white", "text": "label"}]
   }],
   "connections": [{"from": "slot-a", "to": "slot-b", "label": "short relationship"}],
   "takeaway": "one visible conclusion",
   "presentation": {"method": "teaching operation", "why": "why it fits",
                    "visualEvidence": "what the frames will show",
                    "textMode": "labels|descriptive"}
 }]
}"""

RULES = """RULES
1. 2–8 chapters. Each chapter is one teaching step.
2. 3–6 slots per chapter. Use 3–4 for process/timeline.
3. Choose the teaching method FIRST, then a layout that can execute it:
   - construction -> diagram (build the geometry/equation step by step)
   - mechanism -> fanin or diagram (parts feeding a consequence)
   - quantitative -> diagram or matrix, and at least one slot must use
     number-line, sigmoid-plot, vote-bar, sum-node or output-ring
   - comparison -> comparison or matrix
   - procedure -> process or timeline (a true ordered procedure)
   - algorithm -> timeline or process (worked execution)
   - narrative -> timeline (who/what/when, ordered account)
   - recall -> loci or concept (spatial/mnemonic route)
   process is only for a true chain (one input, one output per step). If several
   inputs feed one stage, use fanin or diagram — never chain independent inputs.
   diagram supports at most 3 nodes; fanin 2–3 sources + one hub.
4. textMode: use "labels" with diagram or fanin (compact cards show title/tag;
   body stays available through Details);
   use "descriptive" for process/matrix/timeline/concept (body copy is shown).
   Prefer process/descriptive for text-heavy or multi-step explanations. Use
   diagram supports at most 3 nodes; use process for up to 4 text cards, or split
   the chapter. diagram/labels should use large labels (text sizes 9–14) and
   very short connection labels (2–3 words).
5. Keep presentation short: method <= 80 characters, why <= 350,
   visualEvidence <= 450, textMode labels or descriptive.
6. Every slot needs either a template+data OR artwork, never both.
   - Prefer a template when it fits: weight-dial, sum-node, number-line,
     sigmoid-plot, vote-bar, output-ring.
   - Otherwise author 5–8 primitives in a 0–100 box. One visual metaphor per
     slot: show the mechanism, not a copy of the title.
   - Supported primitives: path, circle, ellipse, rect, line, text.
   - Paints: blue, gold, green, coral, purple, white, muted, none.
   - Text needs an explicit fill (white, muted, or a palette name); size 6–24.
   - Keep labels short; the node title/body carry the prose.
7. Connections join two different slots and carry a short label.
8. Narration must match the slots and their reveal order.
9. Use only icons from the catalog below.
10. No world coordinates, no x/y/width/height on slots."""

TEMPLATE_FIELDS = """TEMPLATE DATA
- weight-dial: {"weight": 0.7, "input": 2, "product": 1.4}
- sum-node: {"terms": [1.4, -0.5], "total": 0.9}
- number-line: {"min": -1, "max": 2, "value": 0.5}
- sigmoid-plot: {"input": 0.5, "output": 0.62}
- vote-bar: {"value": -0.5}
- output-ring: {"value": 0.62, "label": "output"}"""


def plan_prompt(question: str, icons: list[str] | set[str]) -> str:
    return "\n\n".join([
        "Design a hybrid visual lesson for this question:\n" + question,
        SCHEMA,
        RULES,
        TEMPLATE_FIELDS,
        "ICON CATALOG: " + ", ".join(sorted(icons)),
        "Return the JSON object now.",
    ])


def request_body(question: str) -> dict:
    return {"question": question, "mode": "lesson",
            "capabilities": {"teaching": ["construction", "mechanism", "quantitative",
                                          "comparison", "procedure", "algorithm",
                                          "narrative", "recall"],
                             "layouts": ["process", "fanin", "diagram", "matrix",
                                         "timeline", "comparison", "concept", "loci"],
                             "templates": ["weight-dial", "sum-node", "number-line",
                                           "sigmoid-plot", "vote-bar", "output-ring"]}}


def revision_prompt(plan: dict, findings: list[dict]) -> str:
    return "\n\n".join([
        "Revise this hybrid lesson plan. Return the complete corrected plan JSON.",
        "Only change the chapters named in the findings; keep every other chapter "
        "and all established numbers, labels and narration facts.",
        "FRAME-REVIEW FINDINGS:",
        json.dumps(findings, ensure_ascii=False, indent=1),
        "CURRENT PLAN:",
        json.dumps(plan, ensure_ascii=False),
    ])


def describe(plan: dict) -> str:
    return json.dumps({k: plan.get(k) for k in ("title", "question")}, ensure_ascii=False)
