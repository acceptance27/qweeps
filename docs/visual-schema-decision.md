# Visual Schema Decision Record — Live Schema vs v3

Status: decided, 2026-10-31
Scope: generated visual lessons (`teach_v3`, `browser_lessons`, the studio player)
Related: `docs/visual-learning.md`, `docs/v3-compilebeat-architecture.md`,
`docs/v3-compilebeat-execution-plan.md`, `docs/visual-generation-retrospective.md`,
`docs/visual-hybrid-plan.md`

## 1. Decision

Pause free-coordinate authoring in v3. Generated lessons should use the **live
layout schema** (chapters → layout → 3–6 nodes → relative artwork), with the v3
compiler's invariants (IDs, cues, timing, retention, budget) and a **rendered
frame review** before approval.

The v3 compiler is retained. The v3 authoring surface (20–40 elements per beat
with absolute world coordinates, free labels and free annotations) is retired as
a generation format.

## 2. The three schemas

The repository currently contains three rendering contracts. They are not
interchangeable.

| schema | produced by | consumed by | status |
|---|---|---|---|
| v2 generated scene (`box/circle/text/arrow/line`) | old `/ask` JSON | `PlanCanvas` | legacy |
| live lesson (`chapters`, `layout`, `nodes`, `artwork`) | `browser_lessons.py` | `GeneratedStage` + `DiagramArtwork` + HyperFrames | current, proven |
| `CompiledBeat` (`beats`, `elements`, `svg`, `bars`, `points`) | `teach_v3` + Line DSL | ManimGL (`generated_live.py`) | research; no live renderer |

## 3. What the Live Schema is

A lesson is a list of chapters. Each chapter chooses a layout and fills a small
number of nodes:

```json
{
  "id": "weighted-summation",
  "title": "Weighting and Accumulating Inputs",
  "question": "How does the neuron scale and combine inputs?",
  "narration": "...",
  "visual": {
    "layout": "diagram",
    "nodes": [
      {
        "id": "input-keyword",
        "title": "Keyword Signal w1x1",
        "body": "Input x1=3 scaled by w1=+0.8 yields +2.4.",
        "position": {"x": 80, "y": 130, "width": 420, "height": 160},
        "artwork": [
          {"type": "circle", "cx": 50, "cy": 30, "r": 18, "stroke": "blue"},
          {"type": "line", "x1": 50, "y1": 30, "x2": 63, "y2": 21, "stroke": "blue"},
          {"type": "text", "x": 50, "y": 82, "size": 10, "text": "+2.4"}
        ],
        "motion": [{"cue": "summing-junction", "dx": 20, "dy": 0, "duration": 1.2}]
      }
    ],
    "connections": [
      {"from": "input-keyword", "to": "summing-junction", "label": "scales to +2.4"}
    ],
    "takeaway": "Weights scale inputs; the accumulator sums the products.",
    "presentation": {"method": "annotated signal flow", "textMode": "labels"}
  }
}
```

The model does **not** control:

- text measurement, wrapping, font size (`fitCopy`);
- node boxes and spacing (`nodeBoxes`);
- edge routing and arrowheads (`diagramEdge`);
- chapter timing and playback;
- how artwork scales inside its node.

It chooses a layout (`diagram`, `process`, `matrix`, `timeline`, `concept`),
writes 3–6 nodes, and supplies relative artwork primitives. The renderer owns
composition.

The pipeline adds:

- storyboard validation (layouts, visible operations, continuity),
- source review for supplied PDFs,
- narrative-continuity review,
- **browser frame review**: early/middle/finished frames per chapter go to a
  vision model; a rejected lesson gets one revision before publish.

## 4. What v3 is

v3 is a compiler-first pipeline:

```
planner → beat contract → per-beat Line DSL → compile_lesson
        → deterministic gate → text judge
```

A beat is a list of elements with absolute world coordinates:

```text
beat weighted_inputs
retain neuron_body, input_x1
@cue:weights
show w1 label="+0.8" dock=above:flow_x1
link flow_x1 from=input_x1 to=neuron_body sign=+
chart activation_curve type=line data=[0:0, 0.7:0.7, 1:1]
```

which lowers to `CompiledBeat`:

```json
{"elements": [
  {"id": "w1", "kind": "text", "x": -1.8, "y": 0.5, "width": 1.6, "height": 0.4},
  {"id": "flow_x1", "kind": "arrow", "from": "input_x1", "to": "neuron_body"},
  {"id": "activation_curve", "kind": "svg", "x": 2.85, "y": 0.0,
   "bars": [{"label": "0", "value": 0.0}, {"label": "0.7", "value": 0.7}],
   "svg": "<svg viewBox=\"0 0 100 60\">...</svg>"}
]}
```

v3 owns IDs, provenance, cue times, retention, containment, timing, text metrics
and a deterministic gate. It does not own layout: the model supplies coordinates.

## 5. Evidence

All runs used the question *"How does a single artificial neuron compute its
output?"*.

| run | model | schema | wall time | outcome | visual score |
|---|---|---|---|---|---|
| v3 DSL | Muse 1.3 | free coordinates | ~4.3 min authoring + 4–8 min judge per cycle | never approved visually | **2/10** |
| v3 DSL | DeepSeek V4.1 Flash | free coordinates | 3.5–12.7 min per cycle | reached judge; blocked on semantics and layout | **2/10** |
| live | Muse 1.3 | chapters/layouts/artwork | **3:11** | published, frame review approved (0 findings) | **5–6/10** |
| live | DeepSeek V4.1 Flash | chapters/layouts/artwork | ~16 min to review | frame review **rejected (20 findings)**; revision incomplete | not scored |
| live | MiMo V2.6 Flash | chapters/layouts/artwork | **killed at 12.2 min** | planner 171 s; directing never finished; over budget | not scored |
| live | Gemini 3.8 | chapters/layouts/artwork | ~6 min authoring | authoring complete; review blocked by Antigravity quota; previewed from the draft | **8/10** |

The Muse pair is the controlled comparison: **same model, same question, two
schemas**. Live moved it from unusable to usable. That isolates the schema as the
dominant factor.

The Gemini live run is a diagnostic preview, not a published lesson: the
Antigravity quota was exhausted during source review, so `lesson.json` was
reconstructed from the completed draft and rendered directly. It is still valid
evidence of what the live schema + a stronger model produces.

### v3 frames (diagnostic renderer)

Rendering the DeepSeek v3 scene with `bench/preview_scene.py` showed:

- three weight boxes stacked on top of each other, captions overlapping;
- arrows crossing through labels;
- labels clipped at the stage edge;
- a sigmoid squeezed into a corner with stacked data labels;
- annotations naming objects that were no longer on stage.

The compiled JSON passed the deterministic gate and reached the text judge.

### live frames

- Muse: three readable chapters (inputs/weights, sum+bias, activation). Sparse
  artwork, some crossing connectors, but no pile-up and no clipped labels.
- Gemini: four-card process chapter, weighted-input diagram, and a sigmoid panel
  with a projected sample; clean typography and icons.

## 6. Why the Live Schema succeeded

1. **Right abstraction.** The model chooses what the picture is; the renderer
   decides where things go.
2. **Renderer-owned composition.** Spacing, typography, edges and scaling are
   deterministic once the layout is chosen.
3. **Bounded task.** 3–6 nodes per chapter with relative artwork is tractable;
   30 free elements are not.
4. **Measured text.** Labels are fitted inside their boxes before rendering.
5. **Frame review.** Approval is based on pixels, so composition errors can be
   rejected.
6. **Schema effect is visible immediately.** Same model, better schema, better
   output without prompt tuning.

## 7. Why v3 failed

1. **The model was the layout engine.** Absolute coordinates and per-element
   sizing with no global layout pass.
2. **Labels had no owner.** A separate text element is not tied to its shape.
3. **The gate had blind spots.** It checked `kind:"text"` collisions, not
   element labels, shape-to-shape overlap, clipping or z-order.
4. **The judge read JSON, not pixels.** It could critique semantics but could not
   see a pile-up.
5. **Density was unbounded.** A 40-element cap and a 46-object contract allowed
   beats that no layout could compose.
6. **Repair is not composition.** Dozens of real compiler fixes made beats
   compile; they could not make them look good.

## 8. What a hybrid does

Keep v3's compiler and gates; replace v3's authoring format with layout slots.

### Pipeline

```
planner (lesson skeleton + layout per chapter + slots)
  → director (fills 3–5 slots, relative artwork, cues)
  → compiler (IDs, cues, timing, retention, containment, budget)
  → lower directly to the live chapter schema (never to flat CompiledBeat)
  → renderer (typography, spacing, lanes, edges, motion)
  → deterministic gate (labels, shapes, clipping, z-order)
  → frame review (early/middle/finished)
  → semantic judge (second opinion)
  → publish
```

### Responsibilities

| concern | owner |
|---|---|
| lesson structure, layout choice, content | model |
| slot fill, relative artwork, emphasis | model |
| IDs, provenance, cue binding, timing | v3 compiler |
| retention/exit, containment, budget | v3 compiler |
| typography, spacing, edge routing, scaling | renderer |
| collision/clipping/z-order | deterministic gate |
| visual quality | frame review |
| factual/teaching accuracy | source + judge review |

### Lowering target

Lower the validated slot model **directly into the live chapter schema**
(`chapters[].visual.nodes/connections`). Do not lower into `CompiledBeat`: its
flat world-space `elements[]` bypass `fitCopy`, `nodeBoxes`, `diagramEdge`,
`GeneratedStage` and the HyperFrames adapter, which are the composition engine
that produced the readable lessons. `CompiledBeat` remains useful as a
diagnostic/legacy format, not as the render target.

### Latency: what the hybrid does and does not fix

The hybrid removes one large cost and one retry class, but it does not make the
whole pipeline fast by itself.

- **Removed:** the separate contract call (51–102 s in v3) when slots are folded
  into the planner/storyboard; v3-style element retries caused by free
  coordinates; wasted vision reviews on structurally broken chapters.
- **Reduced:** per-chapter token output (3–6 nodes vs 20–40 elements), so fewer
  coordinates and fewer repair prompts.
- **Not fixed:** the planner call (58–69 s), the first frame review (tens of
  seconds), and the semantic judge (200–600 s in v3). Time-to-first-beat is
  still planner + first chapter unless the plan is trimmed, cached or authored
  by a faster model.
- **Already parallel:** the live pipeline runs direction sections and source
  reviews two at a time (`ThreadPoolExecutor(max_workers=2)`), so chapter
  parallelism is inherited rather than added.

The deterministic checks (IDs, cues, retention, budget) are microseconds; their
value is avoiding an expensive render/review pass on a broken chapter, not the
check time itself.

### What survives from v3

- deterministic gate (extended to labels, shapes, clipping);
- IDs and provenance;
- cue/timing model and DAG;
- checkpoint/resume;
- judge/revision harness;
- failure corpus and telemetry.

### What is retired

- free coordinates as an authoring surface;
- free-floating labels and annotations;
- free SVG strings as the primary chart mechanism;
- text-only approval for visual lessons.

### Expected effect

- Muse-class models: **5–6/10 → ~7/10**, because spacing and collisions stop
  depending on the model.
- Gemini-class models: retain **8/10** composition with fewer retries, because
  the compiler enforces invariants the model currently has to remember.
- Time-to-first-beat: unchanged by the hybrid; it depends on planner + first
  chapter.

## 9. Consequences

1. Do not build a new v3 renderer. The live renderer already exists and works.
2. Do not extend `PlanCanvas` as the primary target; it is the legacy v2 player.
3. Add labels-as-text, shape overlap, clipping and z-order to the gate before
   the next generation run.
4. Add frame review to any path that can publish a lesson.
5. Keep the v3 compiler tests; they encode the invariants the hybrid needs.

## 10. References

- `src/assistant/visual/browser_lessons.py` — live schema, validation, review
- `src/assistant/visual/v3_pipeline.py` — v3 planner/contract/DSL/judge
- `src/assistant/visual/v3.py`, `plan.py`, `gate.py` — compiler and gate
- `visual-studio/src/live/GeneratedStage.tsx` — live renderer
- `visual-studio/src/learning/PlanCanvas.tsx` — legacy v2 player
- `bench/preview_scene.py` — diagnostic v3 frame renderer
- `bench/rejudge.py` — captured-scene gate/judge replay
- `bench/checkpoints/` — lesson checkpoints used for the v3 replays
