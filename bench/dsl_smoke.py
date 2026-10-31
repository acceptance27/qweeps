"""One-beat QWEEPS Line DSL smoke test with criteria scoring.

Runs the locked Beat 3 prompt on the given models, saves the raw output and
scores criteria 1-7. No compiler, no judge.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from assistant.config import load_config  # noqa: E402
from assistant.llm import build_visual_llm  # noqa: E402
from assistant.visual.pedagogy import _call_model  # noqa: E402

SYSTEM = "Return only the raw QWEEPS Line DSL lines. No Markdown fences, no explanation."

PROMPT = """Emit QWEEPS Line DSL for Beat 3. Output ONLY the raw DSL lines—no Markdown fences, no explanation.

GRAMMAR:
  beat <num>
  retain <id>, ...
  exit <id>, ...
  group <id> contains=[<id>, ...] zone=<left|center|right>_<top|mid|bottom>
  camera frame=[<id>, ...] min_zoom=0.80
  @start | @cue:<name> [loop=<id> passes=<n> pass_duration=<sec> items=[<id>, ...]]
    show <id> [label="<text>"] dock=<right-of|left-of|above|below|inside>:<target_id> [align=<top|mid|bottom|baseline>:<target_id>] [z=<back|base|front|overlay>]
    chart <id> type=<bars|line|scatter> data=[<key>:<val>, ...] dock=<pos>:<target_id> [axis=<id>]
    link <id> from=<src_id> to=<dst_id> [style=solid|dashed|arc_top|flow]
    focus <id> [item=<sub_key>]
    move <id> to=<pos>:<target_id> [duration=<sec>]

RULES:
  1. Use ONLY element IDs from ACTIVE ON CANVAS or REGISTRY AVAILABLE TO ENTER.
  2. Emit @cue headers in the exact order they appear in NARRATION.
  3. Never emit raw x/y/w/h coordinates, hex colors, or role declarations.

--- STATE CARD (BEAT 3 of 6) ---
PEDAGOGICAL ARC:
  prev_claim (Beat 2): "Self-attention mixes token embeddings into a single context vector representing the full prompt."
  bridge: "Show how that context vector projects into next-token probabilities and how one token is sampled and appended."
  target_claim (Beat 3): "The context vector projects into a vocabulary probability distribution where 'mat' leads at 0.62, is sampled, and moves to append to the input row."
  open_question (for Beat 4): "How does the model generate the subsequent token after 'mat' is appended?"

NARRATION (FIXED — bind visuals to these [cue:*] tags in exact order):
  "Now that [cue:project] the context vector holds the prompt's meaning, it projects into a probability chart across the vocabulary. Here [cue:top_prob] 'mat' leads at sixty-two percent, so [cue:sample_draw] the sampler draws 'mat' and [cue:append_tok] appends it to the input sequence."

ACTIVE ON CANVAS (locked positions):
  token_row (kind=group, role=input_token, zone=left_mid, children=[tok_the, tok_cat, tok_sat, tok_on, tok_the2])
  context_vec (kind=box, role=embedding_vector, dock=right-of:token_row)

REGISTRY AVAILABLE TO ENTER:
  proj_arrow (kind=link, role=attention_weight)
  dist_chart (kind=chart, role=probability_dist)
  sampled_mat (kind=chip, role=sampled_output, label="mat", derived_from=dist_chart)
--------------------------------
"""

NARRATION_CUES = ["project", "top_prob", "sample_draw", "append_tok"]
FENCE = re.compile(r"^\s*```[a-zA-Z]*\s*|\s*```\s*$")
DSL_START = ("beat", "retain", "exit", "group", "camera", "@", "show", "chart",
             "link", "focus", "move")


def strip_fences(raw: str) -> str:
    lines = [line for line in raw.splitlines() if not FENCE.match(line)]
    return "\n".join(lines)


def dsl_lines(raw: str) -> list[str]:
    return [line for line in strip_fences(raw).splitlines() if line.strip()]


def prose_lines(raw: str) -> list[str]:
    out = []
    for line in dsl_lines(raw):
        stripped = line.strip()
        if stripped in {"---", "--------------------------------"}:
            continue
        if stripped.startswith(DSL_START):
            continue
        out.append(stripped)
    return out


def cues_in(raw: str) -> list[str]:
    return re.findall(r"@cue:([a-z0-9_]+)", raw)


def sampled_cue(raw: str) -> str | None:
    current = None
    for line in dsl_lines(raw):
        stripped = line.strip()
        match = re.match(r"@cue:([a-z0-9_]+)", stripped)
        if match:
            current = match.group(1)
        elif stripped.startswith(("show ", "move ", "chart ", "link ", "focus ")) and "sampled_mat" in stripped:
            return current
    return None


def normalizations_needed(raw: str) -> list[str]:
    used = []
    if "```" in raw:
        used.append("fences")
    if re.search(r"\b(dock|from|to|loop|align|type|zone|min_zoom):", raw):
        used.append("separators")
    for match in re.findall(r"\[([^\[\]]*)\]", raw):
        if match and ":" in match and "," not in match:
            used.append("list_commas")
            break
    if re.search(r"^@(?!cue:|start\b)[a-z0-9_]+", raw, re.M):
        used.append("cue_alias")
    if re.search(r"^(SHOW|CHART|LINK|MOVE|FOCUS|RETAIN|EXIT|GROUP|CAMERA)\b", raw, re.M):
        used.append("keyword_case")
    return used


def score(raw: str) -> dict:
    text = strip_fences(raw)
    cues = cues_in(text)
    prose = prose_lines(raw)
    link_ok = bool(re.search(r"link proj_arrow[^\n]*from=context_vec[^\n]*to=dist_chart", text))
    sample = sampled_cue(text)
    order_ok = [cue for cue in cues if cue in NARRATION_CUES] == NARRATION_CUES
    forbidden = []
    if re.search(r"\b(x|y|width|height)\s*=", text):
        forbidden.append("coordinates")
    if re.search(r"#[0-9a-fA-F]{6}", text):
        forbidden.append("hex_colour")
    if re.search(r"\brole\s*=", text):
        forbidden.append("role_declaration")
    norm = normalizations_needed(raw)
    return {
        "criteria_1_no_prose": len(prose) == 0,
        "criteria_2_cue_order": order_ok,
        "criteria_3_link": link_ok,
        "criteria_4_sample_under_cue": sample in {"sample_draw", "append_tok"},
        "criteria_5_normalizations": len(norm) <= 5,
        "criteria_6_cues_present": set(NARRATION_CUES) <= set(cues),
        "criteria_7_no_forbidden": not forbidden,
        "details": {
            "cues": cues,
            "sample_cue": sample,
            "prose_lines": prose[:5],
            "normalizations": norm,
            "forbidden": forbidden,
        },
    }


def run(model: str, attempts: int = 1) -> dict:
    cfg = load_config()
    cfg.llm.visual_model = model
    cfg.llm.visual_vision_model = model
    cfg.llm.timeout = 300
    llm = build_visual_llm(cfg)
    results = []
    folder = Path("bench/dsl-smoke")
    folder.mkdir(parents=True, exist_ok=True)
    for index in range(attempts):
        started = time.time()
        try:
            raw = _call_model(llm, SYSTEM, PROMPT, 2000)
            seconds = round(time.time() - started, 1)
            result = {"attempt": index + 1, "seconds": seconds, "raw": raw, "score": score(raw)}
        except Exception as exc:
            result = {"attempt": index + 1, "seconds": round(time.time() - started, 1),
                      "error": str(exc)[:500], "raw": "", "score": {}}
        results.append(result)
        (folder / f"{model.split('/')[-1]}-{index + 1}.dsl").write_text(result.get("raw", ""))
    return {"model": model, "results": results}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", action="append", required=True)
    parser.add_argument("--attempts", type=int, default=1)
    args = parser.parse_args()
    report = {"prompt_version": 1, "models": [run(m, args.attempts) for m in args.model]}
    print(json.dumps(report, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
