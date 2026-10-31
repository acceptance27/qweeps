# Hybrid Visual Pipeline — Implementation Plan

Status: proposed, 2026-10-31
Companion to: `docs/visual-schema-decision.md`, `docs/visual-generation-retrospective.md`
Scope: generated browser lessons (`browser_lessons` + studio + HyperFrames)

## 0. Prototype status (2026-10-31)

First vertical slice landed:

| phase | state |
|---|---|
| H0 schema + fixture | **done** (`tests/fixtures/hybrid_neuron_plan.json`) |
| H1 validator | **done** (`validate_hybrid_plan`) |
| H2 slot placement | **done** (topology-aware: sources left, hub right, chains left-to-right; `fanin` layout in the live renderer) |
| H3 artwork templates | **done** (6 templates) |
| H5 pre-render gate | **partial** (`check_lesson_geometry`: stage bounds, node overlap, text density, hidden body/tag in labels mode) |
| H4 planner/slot prompts | **done (first run)** — `hybrid_prompt.py`, `bench/hybrid_generate.py` |
| H6 frame review + revision | **done (review/revision loop)**; streaming pending |
| H7 benchmark (Muse/DeepSeek/Gemini) | **directional run** (Muse, DeepSeek; Gemini quota) |
| H8 cleanup/rollout | pending |

Artifacts:

- `src/assistant/visual/hybrid.py` — validator, placement, templates, compiler, gate
- `bench/hybrid_lesson.py` — plan → live lesson JSON, optional studio publish
- `tests/test_hybrid.py` — 15 tests
- Preview: `?lesson=c72baf97798f3f1d51fa729bc1eaed6e` in the studio

Observed on the fixture (3 chapters, 90 s):

- chapter 1 (inputs → hub) and chapter 3 (score → sigmoid → output) read well;
- chapter 2 (signed votes + bias → sum) is clean but sparse;
- the live renderer draws 100-unit artwork at a fixed small scale, so hubs
  should carry at most two readable lines; terms belong in node copy/edges;
- edges stop short of a far hub (renderer `diagramEdge` cap at 0.45 of the
  centre distance); a closer/smaller hub or a renderer tweak would close it.

Model-generated plan (Muse 1.3, 2026-10-31):

- one planner call: **10.6 s**;
- 3 chapters: `process` (3 nodes), `diagram` (4), `concept` (4);
- geometry approved;
- quality: **6–7/10** — process cards and concept satellites are close to the
  live Muse lesson; the diagram chapter is clean but its bias value is hidden in
  labels mode (the tag `0.9-0.4=0.5` does not render), so the shift is asserted
  by the number line 0.5 rather than shown as a -0.4 offset;
- no frame review or streaming yet; this is first-pass authoring.

Voice-enabled run (same day):

- lesson `ef9497b8e3e38062854bfa47e16b9fc5`, 3 chapters;
- synchronized narration built by the live pipeline (`audioTrack`, 38.55 s WAV);
- chapters retimed to the speech: 0–14.42, 14.42–26.77, 26.77–38.55;
- TTS provider returned one 503 (Fish free model); a retry with cached word
  anchors succeeded;
- playback verified in the studio: the audio element loads
  `/narration/d5bfff….wav`, plays (`paused=false`, `currentTime` advances),
  the voice control is on, and captions/visual chapters follow the audio clock.

Frame review and targeted revision (H6, first closed loop):

- `hybrid_review.py` — strict rubric (overlaps, lines through text, clipping,
  chart/label mismatch, hidden values, icon-only nodes), returns findings;
- `bench/hybrid_review.py` — reviews captured frames with a vision model;
- `bench/hybrid_revise.py` — sends findings + the plan back to the model, recompiles;
- first pass rejected with 2 findings (5-node `diagram/labels`, tiny labels,
  pills on connectors);
- revision 1 still rejected (5-node `diagram/descriptive`);
- revision 2 switched the sum chapter to `process` (4 nodes) and was **approved**
  by the frame reviewer.

Deterministic rules added from the review:

- `diagram` supports at most 3 nodes; use `process` (≤4) or split;
- `diagram/labels` keeps short labels;
- presentation fields are validated at plan time (method ≤100 etc.).

Approved lesson: `689ad32a2a10f7f5d1c151fcc5f6e4b4` (3 process chapters,
4-node sum, geometry approved).

Benchmark (same question, same slot schema, cross-review by the other model):

| plan | model | plan time | layouts | strict frame review |
|---|---|---|---|---|
| first fanin prompt | Muse | 83.8 s | process / process / concept | rejected by DeepSeek: inputs chained as a sequence; 0–1 scale not drawn |
| revision 1 | Muse | 82.8 s | diagram / process / process | rejected: sign errors, detached arrows, mixed units |
| first hybrid prompt | DeepSeek | 59.3 s | process / diagram / process | rejected by Muse: crowded diagram labels, tiny text |
| earlier approved | Muse | 25 s | process / process / process | approved by Muse; rejected by DeepSeek (6 findings) |

Conclusion: the infrastructure works; the remaining gap is **model composition
judgment + renderer edge/label geometry**. The `fanin` layout is available but
the models still chain independent inputs or fall back to tiny diagram labels.
A strict reviewer (DeepSeek) and more than one revision are required.

### Teaching grammar (why layouts were not enough)

A layout constrains placement; it does not by itself change the *shape* of the
explanation. In the first methods showcase, comparison, procedure, algorithm,
narrative and recall all rendered as the same three-card row. The `teaching`
field now selects a grammar in `visual-studio/src/live/grammars.tsx`:

| teaching | grammar |
|---|---|
| construction | diagram: artwork, dials, converging arrows |
| mechanism | fan-in: source cards into one hub |
| quantitative | diagram: number line, curve, output ring |
| comparison | criteria table: options as columns, RULE/RANGE + TRADE-OFF rows |
| procedure | numbered rail above ordered cards |
| algorithm | execution trace: step | operation | state/value |
| narrative | chronology axis with captions, no cards |
| recall | spatial route with lettered stations |

Showcase `One Neuron, Eight Lenses` (`61792edc99e6f40f6f9d37bdcdc8fb8e`):
8 chapters, one grammar per teaching method. Strict DeepSeek frame review of all
eight finished frames: **approved**. Diagrams also anchor arrows to the artwork
square rather than the invisible node box.

Narration sync: one 119.7 s recording, chapters retimed to measured word cues;
playback verified. The sync initially failed because the aligner compared
spelled narration ("zero point seven") with digit transcripts ("0 7"); spoken
numbers are now canonicalised in `alignment.py`.

### Live pipeline integration

The live planner and director prompts now require `teaching` before `layout`,
using the same map as the hybrid compiler (`src/assistant/visual/teaching.py`,
shared by `hybrid.py` and `browser_lessons.py`). The live validator rejects:

- a teaching/layout mismatch (e.g. `comparison` with `diagram`);
- `process` graphs that branch or collect several inputs;
- `fanin` without a hub receiving at least two inputs.

The field is preserved through working drafts, revisions, and the published
lesson, so the renderer selects the grammar for model-generated lessons too.

Full suite: **416 tests passing**.

## 1. Goal

Produce a light-quality browser lesson in **≤ 5 minutes of authoring + review**,
using:

- the **live layout contract** for composition (chapters → layout → slots → nodes),
- the **v3 invariants** for correctness (IDs, cues, connection targets, budgets),
- **renderer-owned geometry** (`nodeBoxes`, `fitCopy`, `diagramEdge`),
- a **rendered frame review** before publication.

Non-goals:

- no new renderer;
- no lowering to `CompiledBeat`;
- no ManimGL;
- no free-coordinate authoring;
- no publication without frames.

## 2. Target pipeline

```
question
  → planner: lesson skeleton + per-chapter layout + slot assignments
  → validator: IDs, slots, connection targets, budgets, cues (ms)
  → lower: slots → live chapter schema (positions computed, not authored)
  → renderer: GeneratedStage + fitCopy + nodeBoxes + diagramEdge
  → browser capture: early / middle / finished per diagram chapter
  → frame review: vision model, chapter-scoped findings
  → one targeted revision for flagged chapters
  → optional async semantic judge
  → publish (reviewed only)
```

Chapters are independent snapshots, so they can be **streamed** as they pass
validation and review. The learner should not wait for the last chapter to see
the first one.

Key rule: **the model never emits world coordinates.** It emits slot names and
content; the compiler places slots from a layout template.

## 2b. Streaming and time to first chapter

The live renderer already renders one chapter at a time; the missing piece is
emitting them early.

Event protocol:

```text
plan              lesson skeleton + chapter list
chapter_draft     validated, gated, rendered; playable/queued
chapter_reviewed  frame review passed; mark final
chapter_revised   findings fixed; patch or replay
lesson_ready      all chapters final
```

Policy:

- start playback when chapter 1 is validated, gated and rendered;
- mark it provisional until `chapter_reviewed`;
- patch unplayed chapters silently; replay a played chapter marked "refined";
- hold audio until the chapter is final;
- global source/narrative review runs async and must not block TTFF.

Measured basis (Muse live run): planner 11 s, first direction section 14 s,
whole lesson 3:11 because the player waited for everything. Streaming turns the
first two numbers into a startable first chapter.

TTFF budget:

| stage | target |
|---|---|
| plan + slots | 10–20 s |
| first chapter authored | 15–30 s |
| validate + gate | < 0.1 s |
| render + capture | 5–10 s |
| first-chapter frame review | 10–20 s |
| **TTFF** | **45–70 s** |
| remaining chapters (2 parallel) | 60–120 s |
| **full lesson** | **2.5–5 min** |

## 3. Schema

### 3.1 Plan (model output)

```json
{
  "title": "How a Single Neuron Computes Its Output",
  "question": "...",
  "representation": "...",
  "example": {"title": "...", "description": "...", "icon": "cpu"},
  "chapters": [
    {
      "id": "inputs-weights",
      "title": "Inputs and weights",
      "question": "What does the neuron receive?",
      "insight": "...",
      "narration": "...",
      "layout": "process",
      "slots": [
        {"slot": "stage-1", "title": "Input weighting", "body": "...",
         "icon": "tools", "color": "blue", "tag": "w · x", "at": 2,
         "template": "weight-dial", "data": {"weight": 0.8, "input": 3}},
        {"slot": "stage-2", "title": "Linear summation", "body": "...",
         "icon": "cpu", "color": "purple", "tag": "Σ(w·x)", "at": 9,
         "template": "sum-node", "data": {"terms": [2.4, 1.2], "total": 3.6}}
      ],
      "connections": [
        {"from": "stage-1", "to": "stage-2", "label": "scales inputs", "at": 12}
      ],
      "takeaway": "...",
      "presentation": {"method": "...", "textMode": "labels"}
    }
  ]
}
```

Rules:

- 3–6 slots per chapter; 2–5 chapters.
- `layout` selects a placement template and a slot vocabulary.
- `template` is optional; when present, `data` fills it. When absent, the slot
  renders as a titled node with body text.
- IDs are stable, unique, `[a-z0-9_-]+`.
- `at` is seconds within the chapter; connections carry an explicit `at`.
- No `x`, `y`, `width`, `height` in model output.

### 3.2 Lowered live chapter (compiler output)

```json
{
  "id": "inputs-weights",
  "start": 0, "end": 35, "finishedAt": 33,
  "visual": {
    "layout": "process",
    "nodes": [
      {"id": "stage-1", "title": "...", "body": "...",
       "position": {"x": 80, "y": 130, "width": 300, "height": 340},
       "artwork": [ ... expanded from weight-dial ... ],
       "motion": [...]}
    ],
    "connections": [ ... ],
    "takeaway": "...",
    "presentation": {...}
  }
}
```

`position` is computed by the compiler from the layout template, not authored.

### 3.3 Artwork templates

Small, renderer-owned set. Start with:

| template | data | renderer |
|---|---|---|
| `weight-dial` | `{weight, input, product}` | value dial + arrow + product |
| `sum-node` | `{terms, total}` | accumulator circle with terms |
| `number-line` | `{min, max, value, unit}` | axis + marker + label |
| `sigmoid-plot` | `{input, output, samples}` | axes + curve + projected point |
| `vote-bar` | `{value, sign}` | signed bar |
| `output-ring` | `{value, label}` | ring + value + caption |

Rules:

- at most **6 artwork primitives** per node after expansion;
- prefer a template over raw `path`/`line`;
- charts and equations are primitives, not 15 raw lines;
- unknown template → validation error, not free-form fallback.

## 4. Validator

Extend `browser_lessons.validate_lesson`; do not build a parallel compiler.

Checks:

- unique chapter and node IDs;
- 3–6 slots, 2–5 chapters;
- layout known;
- slot vocabulary matches layout;
- connection endpoints exist and are distinct;
- `at` within chapter duration; connection `at` ≥ both node `at`;
- narration contains a cue for every `at` group (reuse `dsl_prompt.ensure_cues`
  or the live `anchors` model);
- template known and `data` fields complete;
- artwork expansion ≤ 6 primitives; node text within limits;
- no unknown icons/colors;
- optional: a narrated-object audit (every named object has a slot).

Performance target: **< 50 ms per lesson**, no browser involved.

## 5. Gate before render

Add to the deterministic layer:

1. **Labels as text**: a node or connection with a label is a text box; check
   label–label and label–shape collisions.
2. **Shape–shape overlap**: block ≥ 50% area, advisory 30–50%.
3. **Clipping**: every screen box inside the stage with a margin, using the
   chapter camera (live is fixed stage; still check).
4. **Connector–label crossing**: a line segment must not pass through a label
   box; re-route or move the label.
5. **Z-order**: no label behind a filled shape.

Reuse the geometry helpers from `assistant.visual.geometry`; the live renderer
also emits `data-layout-issue` for text overflow — collect and block on those.

## 6. Frame review

Use the existing `LivePreparation` capture path:

- early, middle, finished for `diagram`; early, finished for `process`,
  `matrix`, `timeline`;
- submit `frames` + `layoutIssues` to `/api/visual/live/review`;
- findings are chapter-scoped;
- one revision pass; re-capture only flagged chapters;
- publish only when `review.approved` and no `layoutIssues`.

Reviewer rubric must explicitly reject:

- overlapping labels or labels over shapes;
- connector lines through text;
- clipped elements;
- charts whose drawn values contradict their labels;
- visible objects named in narration but absent.

The current Muse run approved crossing connectors and detached labels; the
rubric is too lenient. Tighten it before benchmarking.

## 7. Work breakdown

| phase | work | estimate | dependency |
|---|---|---|---|
| H0 | Freeze this plan + schema; add fixtures for 3 lessons | 0.5 ED | — |
| H1 | `validate_lesson` extension: slots, templates, budgets, cue checks | 1.5 ED | H0 |
| H2 | Layout placement compiler: slot → position, 4 layouts | 2 ED | H1 |
| H3 | Artwork templates: 6 templates + expansion tests | 2 ED | H2 |
| H4 | Planner/director prompts for slots instead of nodes | 1 ED | H2 |
| H5 | Gate: labels, shape overlap, clipping, connector/label crossing | 1.5 ED | H2 |
| H6 | Frame review rubric + chapter-scoped revision + layoutIssues blocking | 1 ED | H5 |
| H7 | Benchmark: Muse, DeepSeek, Gemini on the same question; TTFF, total, score | 1 ED | H3–H6 |
| H8 | Cleanup: flag, docs, deprecate free-coordinate DSL | 1 ED | H7 |

Total: ~11.5 engineer-days.

## 8. Acceptance criteria

**Correctness**

- Zero lessons published without a frame review.
- Zero `layoutIssues` at publish.
- No clipped or overlapping labels in the finished frames.
- Every connection references a real node; every narrated object has a slot.

**Quality**

- Muse-class: ≥ 6/10, target 7/10.
- Gemini-class: ≥ 8/10.
- No regression against the live Muse baseline (`3:11`, 3 chapters, 5–6/10).

**Time**

- Time-to-first-chapter (TTFF) ≤ 90 s, target ≤ 60 s.
- Full authoring + review ≤ 5 min.
- Streaming: first chapter playable before the last chapter is authored.
- Optional semantic judge runs async; it does not block the first chapter.
- Validator < 50 ms; gate < 100 ms.

**Comparison**

- Same question, same schema, same review for Muse / DeepSeek / Gemini.
- Report wall time, calls, retries, findings, visual score.

## 9. Latency budget

| stage | target |
|---|---|
| planner + slots | 10–20 s |
| first chapter | 15–30 s |
| validator + gate | < 0.1 s |
| render + capture | 5–10 s |
| first frame review | 10–20 s |
| **TTFF** | **45–70 s** |
| remaining chapters (2 parallel) | 60–120 s |
| one revision (only if needed) | 20–40 s |
| **full lesson** | **2.5–5 min** |

Removed versus v3: the separate contract call (51–102 s) and coordinate-repair
retries. Not fixed by this plan: planner latency and the optional semantic judge.

## 10. Risks and mitigations

| risk | mitigation |
|---|---|
| Renderer templates become a new API surface | ship 6 templates; no free-form fallback; add only on proven need |
| Model misplaces nodes despite slots | compiler computes positions; `resolve_diagram_clearance`; no model coordinates |
| Frame reviewer too lenient | explicit reject rubric; block on `data-layout-issue`; human spot-check on benchmark |
| Streamed chapter later revised | gate + frame review before playback; patch unplayed, replay played with a "refined" marker; hold audio until final |
| Planner omits narrated objects | narrated-object audit + narrative review |
| Slot vocabulary too rigid for some topics | layout `concept`/`matrix` fallback; max 2 custom slots per chapter |
| v3 work lost | keep compiler tests and decision/retrospective docs; archive DSL path |
| Regression in live pipeline | new path behind `QWEEPS_HYBRID=1`; live path unchanged until benchmark passes |

## 11. Rollout

1. Implement behind `QWEEPS_HYBRID=1` in the live pipeline.
2. Run the neuron question on Muse and Gemini; compare frames and timings with
   the existing live results.
3. If Muse ≥ 6/10 and Gemini ≥ 8/10 with ≤ 5 min, make it the default.
4. Keep the free-coordinate DSL behind a research flag, not in the product path.
5. Update `docs/visual-learning.md` with the new authoring contract.

## 12. Definition of done

- One neuron lesson on Muse and one on Gemini, both frame-reviewed, both within
  budget, both with frames attached to the benchmark record.
- Validator/gate tests for slots, templates, labels, overlap, clipping.
- A benchmark table in `docs/` with times, calls, findings and visual scores.
- The free-coordinate DSL is documented as legacy/research, not the generation
  path.
