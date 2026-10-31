# Visual Generation Retrospective — v3 and the Live Schema

Date: 2026-10-31
Branch state: working tree, uncommitted
Related: `docs/visual-schema-decision.md`, `docs/v3-compilebeat-architecture.md`,
`docs/v3-compilebeat-execution-plan.md`, `docs/visual-learning.md`

This is the lab record: what we built, what we tried, what failed, what the
measurements actually were, and what we concluded. It is deliberately blunt.

## 1. Starting point

The v3 plan was frozen and implementation started:

- compiler owns deterministic invariants; model supplies intent;
- planner → beat contract → per-beat director → `compile_lesson` → gate → judge;
- a Line DSL as a cheaper, lower-token authoring surface than free JSON;
- contenders: **Muse Spark 1.3 Contributor** (replacing MiMo V2.6 Flash) and
  **DeepSeek V4.1 Flash**; judge: DeepSeek only.

The goal was a generated lesson that passes a deterministic gate and an external
judge, then compare models on quality and time.

## 2. What was built

### Harness

- failure corpus and replay (`bench/replay.py`, `tests/fixtures/failures`);
- call telemetry (`QWEEPS_CALL_LOG`, per-call seconds/chars/model);
- blind judge harness (`assistant.visual.judge`);
- benchmark drivers (`bench/v3_smoke.py`, `bench/dsl_smoke.py`, `bench/run_lesson.py`);
- scene replay tools (`bench/rejudge.py`, `bench/preview_scene.py`).

### Compiler primitives

- role table / palette / focus states;
- bars, links, `svgRef`, `derivedFrom`, `parentId` containment;
- cue-anchored timing, DAG lowering, loops;
- trusted SVG validation;
- text metrics / wrapping / shrink-to-fit;
- deterministic gate: text occlusion, label overflow, missing evidence;
- `CompiledBeat` + provenance IDs (`b{beat}__gen__{parent}__{slot}`).

### v3 pipelines

- JSON path: planner → contract → per-beat director → compile → gate → judge,
  with checkpoint/resume.
- Line DSL path: planner (cue-tagged narration) → contract → per-beat DSL
  director → parser → lower → compile → gate → judge, with targeted revision
  (only flagged beats) and checkpoint/resume.

### Line DSL

Parser and lowering for:

- `beat`, `retain`, `exit`, `group`, `camera`;
- `show` with `zone`, `dock`, `align`, `direction`, `label`, `sign`;
- `chart` (`bars`, `line`, `scatter`), `plot … at=<key>`, `link`, `move`, `focus`;
- normalizations: fences, separators, list commas, cue aliases, keyword case;
- layout: 9 zones, docks, sibling stacking, guide lines, container panels,
  deferred link resolution, global text layout.

### Live pipeline (used as-is)

`browser_lessons.py` + the studio + `GeneratedStage` + HyperFrames:

- chapters with `layout` (`diagram`, `process`, `matrix`, `timeline`);
- 3–6 nodes with relative artwork and motion;
- source/narrative review;
- browser frame review (early/middle/finished) before publish.

## 3. Attempt timeline (all 2026-10-31)

Short version: each v3 run exposed a concrete defect; we fixed it; the lesson
still looked bad. The live run exposed no such defects and looked like a lesson.

| # | attempt | result | fix |
|---|---|---|---|
| 1 | first full DSL lesson | `beat b1_scale` parsed as int → crash | accept id or number |
| 2 | role extension | `neuron` not in roleTable | `_repair_roles` in DSL path |
| 3 | docks | `x1 docks to unknown 'inputs'` | groups placed before children |
| 4 | link collisions | weight box and connector shared an id | rename connector |
| 5 | retention | retained ids lost | inject from boundary/known/registry |
| 6 | effects | absolute start instead of cue anchor | `_enforce_effect_anchors` after retention |
| 7 | element cap | beat exceeded 20 | cap 20 → 28 → 36 → 40 |
| 8 | gate | `z_val overlaps y_val` | gate scale bug (2×) fixed |
| 9 | gate aftermath | captured scene now passed gate **and judge** | confirmed judge was right about geometry |
| 10 | zones | `zone=` dropped by parser → everything at origin | accept `zone` |
| 11 | labels | weight labels on wrong input | source-anchored arrow labels |
| 12 | text layout | labels stacked and crossed arrows | global `resolve_text_layout` |
| 13 | plot math | marker at chart centre, ReLU drawn by index | numeric-key domain + `plot` |
| 14 | label changes | same id relabelled twice in one beat | reject with guidance |
| 15 | connectors | duplicate endpoints, rewired retained links | reject with guidance |
| 16 | bars | negative values silently clamped to 0 | reject for bars; support negatives for lines |
| 17 | indicators | `bias_shift_arrow` shown as element | one-anchor direction glyphs |
| 18 | guides | `axis_z` treated as an edge | guide lines with orientation |
| 19 | panels | chart forced out of its panel | container roles accept oversized content |
| 20 | link order | links before their endpoints | deferred link resolution |
| 21 | retention again | contract resurrected 46 objects | DSL `retain`/`exit` win |
| 22 | plot keys | `at=z=1.0` vs key `z_1` | key normalization |
| 23 | capacity | no free slot for a chart | size-aware slot search |
| 24 | provider | one 600 s timeout | one transient retry |
| 25 | live Muse | **3:11, 3 chapters, review approved** | — |
| 26 | live DeepSeek | first frame review **rejected with 20 findings** (overlaps, collapsed gates, invisible bias, inward arrows, 150 px chart) | revision started, then the status endpoint hit a `set` JSON bug; not fixed | 
| 27 | live MiMo V2.6 Flash | planner 171 s, directing still running at 12.2 min | killed as over budget; no frames |
| 28 | live Gemini | **~6 min authoring, 5 chapters, review quota-blocked** | — |

## 4. Failure taxonomy

| class | example | who caught it |
|---|---|---|
| compile/schema | `show` on a connector, duplicate endpoints, unknown dock | compiler |
| gate false positive | 2× `screen_box` blocked non-overlapping labels | us, by replaying a captured scene |
| gate blind spot | labels on boxes, shape-shape overlap, clipping | nobody; found by rendering |
| judge semantic | zero line not between totals; annotations for exited objects | text judge |
| visual composition | stacked boxes, crossing arrows, blank charts | human frame review |
| provider | quota, timeout | runtime |
| status serialization | live `revisedBeats` set breaks `/live/jobs/<id>` JSON | runtime (not fixed) |

The critical row is **gate blind spot**. The v3 gate believed labels were only
`kind:"text"`; most labels were `element.label` on boxes. It never saw them.

## 5. Results

### Models and pipelines

| run | model | schema | wall time | calls | outcome | visual |
|---|---|---|---|---|---|---|
| v3 DSL | Muse 1.3 | free coordinates | ~4.3 min authoring; 8–13 min per cycle | 6–11 | never approved visually | **2/10** |
| v3 DSL | DeepSeek V4.1 Flash | free coordinates | 213 s first run; 764 s later cycle | 6–10 | judge blocked; no approval | **2/10** |
| live | Muse 1.3 | chapters/layouts | **3:11** | plan + sections + reviews | published; frame review approved (0 findings) | **5–6/10** |
| live | DeepSeek V4.1 Flash | chapters/layouts | ~16 min to first review | plan + sections + reviews | **frame review rejected: 20 findings**; revision incomplete | **not scored** |
| live | MiMo V2.6 Flash | chapters/layouts | **killed at 12.2 min** | planner 171 s; directing never finished | **over budget; no frames** | **not scored** |
| live | Gemini 3.8 | chapters/layouts | ~6 min authoring | plan + 5 sections + reviews | quota exhausted during source review; previewed draft | **8/10** |

### Timing detail

- Muse v3 authoring: planner 69 s, contract 51 s, beats 88 s, retries +51/+22 s.
- DeepSeek v3: planner 58 s, contract 102 s, beats 10–18 s.
- Judge calls: 220–600 s each; one 600 s timeout.
- Live Muse: 15:52:02 → 15:55:13.
- Live Gemini: 15:29 → 15:38 (quota during source review).

### Test suite

**385 tests passing.** The compiler invariants are covered even though the
authoring layer is being retired.

## 6. What the frames showed

v3 (DeepSeek checkpoint, rendered with `bench/preview_scene.py`):

- three weight boxes stacked on top of each other;
- captions (`0.5 × 1.2 = 0.6`, `1.0 × 0.8 = 0.8`) overlapping;
- arrows crossing through labels;
- labels clipped at the stage edge;
- sigmoid squeezed into a corner with stacked data labels;
- annotations referring to objects no longer on stage.

Live Muse:

- three readable chapters: inputs/weights, sum+bias, activation;
- titles, body copy, tags, labeled connectors;
- sparse artwork, some crossing connectors, a detached ReLU step;
- no pile-up and no clipped labels.

Live Gemini:

- four-card process chapter with icons, tags and labeled arrows;
- weighted-input diagram with an accumulator circle;
- sigmoid panel with `z=3.1 → 0.96` and an output ring;
- clean typography; the composition is the reference.

## 7. Why the outcomes diverged

The v3 failure was structural, not semantic:

- the model was the layout engine;
- labels had no owner;
- the gate couldn't see element labels, shape overlap or clipping;
- the judge read JSON, not pixels;
- density was unbounded.

The live success was structural too:

- the model chose layouts and filled 3–6 slots;
- the renderer owned typography, spacing, edges, scaling;
- frame review saw the pixels.

Same Muse model, two schemas: **2/10 vs 5–6/10**. That is the cleanest evidence
that the schema, not the model, was the dominant variable. Gemini adds polish on
top of the same schema: **8/10**.

## 7b. Hybrid prototype (after the comparison)

A first vertical slice of the hybrid was built and rendered:

- slot schema with 3–6 slots per chapter; no model coordinates;
- deterministic placement by graph shape (sources left, hub right, chains
  left-to-right);
- six declarative artwork templates;
- compiler lowers to the **live chapter schema** (not `CompiledBeat`);
- pre-render gate for stage bounds, node overlap and text density;
- fixture neuron lesson: 3 chapters, 90 s, 3/4/3 nodes, geometry approved.

Frames: chapter 1 and 3 are clean and readable; chapter 2 is clean but sparse.
The live renderer's fixed 100-unit artwork scale limits how much text a hub can
carry, so hubs use two lines and rely on node copy/edges for terms. Arrowheads
stop short of a far hub because `diagramEdge` caps the trim at 0.45 of the
centre distance.

Then a real model run filled the same schema:

- Muse 1.3, one planner call: **10.6 s**;
- 3 chapters: `process` (3 nodes), `diagram` (4), `concept` (4);
- templates only; geometry approved;
- frames: process cards with icons/body/tags, a clean left-to-right
  sum→bias→sigmoid→output chain, and a concept hub with four satellites;
- quality **6–7/10** — clearly above the hand-written fixture and close to the
  live Muse lesson, still below Gemini's 8/10 because the artwork is templates
  and the text load is higher;
- finding: in the diagram chapter the bias value is not visible (labels mode
  hides the tag `0.9-0.4=0.5`), so the shift reads as "0.5" rather than "0.9
  minus 0.4". A frame review should reject that.

A voice-enabled run followed:

- same hybrid schema, lesson `ef9497b8…`;
- synchronized narration via the live pipeline: one 38.55 s audio track, chapters
  retimed to the speech (0–14.42, 14.42–26.77, 26.77–38.55);
- one TTS 503 (Fish free model) then a successful retry with cached anchors;
- studio playback verified: audio loads and plays, voice control on, captions
  and chapters follow the audio clock.

Frame review and targeted revision then closed the loop:

- first capture review rejected the 5-node `diagram/labels` sum chapter
  (tiny text, labels on connectors);
- revision 1 kept `diagram` with 5 nodes and was rejected;
- revision 2 switched it to `process` with 4 nodes and was **approved**;
- the compiler now rejects `diagram` with more than 3 nodes, process with more
  than 4, and invalid presentation lengths before rendering.

Approved by Muse: `689ad32a2a10f7f5d1c151fcc5f6e4b4` (3 process chapters).
Cross-review by DeepSeek rejected it (6 findings: orphaned connector labels,
sequential topology for parallel votes, tiny tags, no curve for the sigmoid).

H7 benchmark (same slot schema):

| model | plan | layouts | review |
|---|---|---|---|
| Muse | 83.8 s | process/process/concept | rejected: chained inputs, missing 0–1 scale |
| Muse revision | 82.8 s | diagram/process/process | rejected: sign errors, detached arrows, mixed units |
| DeepSeek | 59.3 s | process/diagram/process | rejected: crowded diagram labels, tiny text |

No model produced a strict-review-approved lesson in this round. A `fanin`
layout (sources left, hub right, cards) was added to the live renderer and
compiler, but the models did not use it correctly.

## Follow-up: teaching grammars, not more layouts

The eight teaching methods were real, but five of them rendered as the same
three-card row. That is a renderer failure, not a model failure. Each method now
selects a distinct grammar: criteria table (comparison), numbered rail
(procedure), execution trace (algorithm), chronology axis (narrative), spatial
route (recall), plus diagram, fan-in and quantitative diagram.

The showcase `One Neuron, Eight Lenses`
(`61792edc99e6f40f6f9d37bdcdc8fb8e`, 8 chapters) passed a strict DeepSeek
frame review of all eight finished frames. Diagram edges were also re-anchored
to the artwork square instead of the invisible node box.

Voice sync first failed at chapter 1: the script said "zero point seven" while
the recognizer transcribed "0 7", so only 74% of the chapter matched. Spoken
numbers are now canonicalised before alignment. The retry produced one 119.7 s
recording and retimed all eight chapters; playback was verified.

## 8. Ideas attempted and rejected

- **Raise the element cap.** Tried 20 → 28 → 36 → 40. It let beats compile; it
  did not make them readable.
- **More prompt rules.** Fixed connector misuse, label swaps, duplicate IDs. It
  did not produce composition.
- **Extend `PlanCanvas` for v3 SVG/paths/bars.** Rejected: legacy v2 player, no
  chapters/artwork/motion/HyperFrames.
- **Use ManimGL frames for QA.** Rejected: the user deprecated ManimGL in favor
  of live browser scenes.
- **Static website first.** Deferred by request; still a good fallback for demos.
- **Let the judge approve without frames.** Rejected after the render test: it
  approved a scene that was visually unusable.

## 9. Current artifacts

Code:

- `src/assistant/visual/line_dsl.py` — parser, layout, lowering (596 lines)
- `src/assistant/visual/v3_pipeline.py` — JSON + DSL pipelines (733 lines)
- `src/assistant/visual/plan.py` — validation/compiler (775 lines)
- `src/assistant/visual/gate.py` — deterministic gate (82 lines)
- `src/assistant/visual/dsl_prompt.py`, `geometry.py`, `contract.py`, `judge.py`,
  `timing.py`, `trusted_svg.py`, `text_layout.py`
- `visual-studio/` — live renderer, studio, HyperFrames adapter

Bench:

- `bench/v3_smoke.py`, `bench/dsl_smoke.py`, `bench/preview_scene.py`,
  `bench/rejudge.py`, `bench/replay.py`
- `bench/checkpoints/` — lesson checkpoints
- `.playwright-mcp/` — live lesson screenshots
- `docs/visual-schema-decision.md` — the decision record

Uncommitted. No commits or pushes were made during this work.

## 10. Next steps

1. **Extend the gate** to labels-as-text, shape-shape overlap, clipping and
   z-order. It should have rejected the v3 scenes; it didn't.
2. **Build the hybrid**: layout slots + v3 compiler invariants + live renderer +
   frame review. See `docs/visual-hybrid-plan.md`.
3. **Re-run the model comparison on one schema**: Muse vs DeepSeek vs Gemini on
   the live schema, same question, same review, same timing.
4. **Keep the compiler tests**; they encode invariants the hybrid needs.
5. **Clean up**: decide which v3 modules are kept, which are archived, and commit
   the decision record with the code.

## Appendix — commands used

```bash
# full suite
.venv/bin/python -m pytest tests/ -q -p no:randomly

# full v3 lesson (DSL path)
QWEEPS_DSL=1 QWEEPS_CALL_LOG=/tmp/opencode/bench/calls.jsonl \
  .venv/bin/python bench/v3_smoke.py \
  --model opencode-go/muse-spark-1.3-contributor \
  --judge opencode-go/deepseek-v4.1-flash \
  --question "How does a single artificial neuron compute its output?" \
  --label muse-dsl-neuron

# replay a checkpoint into frames (diagnostic renderer)
.venv/bin/python bench/preview_scene.py \
  --checkpoint bench/checkpoints/deepseek-dsl-neuron.json \
  --out /tmp/opencode/preview --frames early,mid,end
rsvg-convert -w 1440 -h 800 /tmp/opencode/preview/beat_0_end.svg \
  -o /tmp/opencode/preview/beat_0_end.png

# re-gate/re-judge a captured scene
.venv/bin/python bench/rejudge.py /tmp/opencode/qweeps-capture/failure-*.json

# live pipeline (server + studio)
QWEEPS_CONFIG=/tmp/opencode/muse-live/config.toml \
QWEEPS_STUDIO_DIR=$PWD/visual-studio \
  .venv/bin/python -m assistant.visual.server --port 4174
# then POST /api/visual/live/jobs and open /?job=<id>&muted=1
```
