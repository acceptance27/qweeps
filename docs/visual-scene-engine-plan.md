# Visual Scene Engine Plan: Manim-shaped IR, Morph, Retention, and Review

Status: **P0 prototype built; P1–P5 planned.**
Scope: the live browser lesson runtime. Actual Manim is a reference grammar, not a
production dependency.

## 1. Decision

Adopt a **per-chapter grammar** behind one player:

- **scene grammar** for construction, mechanism, and quantitative beats;
- **card/hybrid grammar** for comparison, procedure, algorithm, narrative, and
  recall beats.

Both compile into the same live lesson schema and play on the same SVG/GSAP
clock. The chapter is the switch boundary. The model chooses the teaching method;
the compiler chooses the grammar; the player does not switch products.

The scene grammar is **Manim-shaped declarative IR**, not Manim Python. The
compiler owns measurement, layout, canonical paths, morphs, docking, timing and
validation. It does not run Cairo, LaTeX, ffmpeg, or an MP4 per beat.

## 2. Evidence and target rhythm

The archived `WWIDecision` lesson
(`manim-movingcamerascene-studio/examples/teaching-methods/lessons.py`,
rendered at 1280×720/30 fps, 113.433 s, 5 beats) is the reference.

| beat | start | duration | play calls | grouped ops | ops/10 s | starts/10 s |
|---|---:|---:|---:|---:|---:|---:|
| 0 | 0.000 | 16.100 | 3 | 9 | 5.59 | 1.86 |
| 1 | 16.100 | 24.433 | 6 | 15 | 6.14 | 2.46 |
| 2 | 40.533 | 24.600 | 6 | 12 | 4.88 | 2.44 |
| 3 | 65.133 | 22.134 | 5 | 10 | 4.52 | 2.26 |
| 4 | 87.267 | 26.166 | 5 | 18 | 6.88 | 1.91 |
| **total** | | **113.433** | **25** | **64** | **5.64** | **2.20** |

Other measured properties:

- one `self.play` start every ~4.5 s;
- 5–6 grouped visual operations per 10 s;
- longest continuous animation: a 4 s ship move;
- only explicit hold: 1.5 s;
- no full-screen wipe between beats;
- 2 retained thumbnails (shipping, diplomacy);
- 1 conceptual mitosis (route → two aligned views) via
  `ReplacementTransform` + `TransformFromCopy`;
- 15 review frames, 3 per beat.

Important caveats:

- `visual_review` is approved; the receipt's `teaching_review` is still
  `"pending: inspect frames and playback"`;
- the review scope is not a learner-retention study;
- the 15 frames are beginning/middle/end, not action-boundary coverage.

The retention claim is a design inference from choreography, not a measured
learning outcome. The plan treats these numbers as **pacing targets**, not proof
of retention.

## 3. Current baseline (P0)

### Built

- `visual-studio/src/live/ir.ts` — v0 scene IR compiler:
  - circles, rects, text, lines, arrows, number lines, bars, groups;
  - `move_to`, `next_to`, `arrange`, `align_to`, `scale_to_fit_width`;
  - measured text, Y-up frame, 0–100 emission, overflow findings;
  - arrows resolved from object boxes after layout.
- `visual-studio/src/live/ir.fixtures.ts` — construction, mechanism,
  quantitative fixtures.
- `visual-studio/src/live/morph.ts` — canonical 8-cubic loops, line as a
  zero-thickness loop, rect loops, path emission, transform baking, pacing.
- `visual-studio/src/live/MorphPilot.tsx` — standalone morph pilot:
  route → left/right comparison, ship movement/copy, docked retained thumbnail,
  clickable group, proposal build.
- `visual-studio/src/live/morph.test.ts` and `ir.test.ts` — 8 tests.
- `bench/hyperframes_check.py`, `src/assistant/visual/browser_gate.py` —
  static browser gate for contrast/clipping/overflow/occlusion/craft.
- chapter streaming, per-chapter gate, priority/parallel checks.

### Known P0 limitations

- The IR fixtures and morph pilot are **hand-authored**, not model output.
- The IR v0 label placement is approximate: circle labels can sit tight, arrow
  labels can crowd the shaft, and `text-anchor` is not yet used.
- The pilot uses stage-space paths; group-transform baking is not exercised.
- The morph is line → rect, not arbitrary group morph.
- Labels crossfade; text is not morphed.
- The pacing validator is in the pilot; it is not yet an enforced compiler gate.
- The browser gate samples finished frames, not action boundaries or
  mid-morph states.
- The scene grammar is not integrated into the live lesson schema/player.
- The eight scene chapters are hand-authored and schematic.
- Compound objects, hull/settle morphs, and the settled-poster density gate do
  not exist yet; this is why the final frames are primitive.

## 4. Architecture

```
teaching method
      │
      ├── card grammar ──────────────┐
      │                              ├──▶ live lesson schema ──▶ SVG/GSAP player
      └── scene IR ──▶ compiler ─────┘
                         │
                         ├── measured text
                         ├── relational layout
                         ├── canonical cubic paths
                         ├── morph/dock/move/scale/indicate timeline
                         └── pacing + geometry findings
```

### 4.1 Teaching → engine

| teaching | engine | grammar |
|---|---|---|
| construction | scene | IR |
| mechanism | scene | IR |
| quantitative | scene | IR |
| comparison | cards | comparison / matrix |
| procedure | cards (or scene when flow matters) | process / timeline |
| algorithm | cards (trace) | timeline / process |
| narrative | cards | timeline |
| recall | cards | loci / concept |

`engine` is derived from `teaching`, persisted in the chapter for review and
telemetry, and validated. The model does not freely choose a framework.

### 4.2 Scene IR v1

Canonical frame: **100×100**, y-up, uniform mapping to the final art square. All
text sizes are in frame units; the compiler measures at
`size × artViewportPx / 100` and enforces a **minimum rendered pixel size**.

Objects:

- `circle`, `dot`, `rect`, `line`, `arrow`, `curve`/`arc`, `text`,
  `number-line`, `axes`, `bars`, `group`, `icon`.

Layout/ops:

- `next_to`, `arrange`, `align_to`, `move_to`, `scale_to_fit_width`;
- `morph` (`replace` | `copy`);
- `dock` (retained thumbnail slot);
- `indicate`;
- `fade_in` / `fade_out` / `create` / `write`;
- `move`, `scale`, `set_color`.

Rules:

- arrows resolve `from`/`to` endpoints after layout; never `next_to` an arrow;
- labels fit inside or move outside by `next_to`;
- text is measured at the final viewport; no post-scale of measured text;
- `scale_to_fit_width` rejects text groups in v1; reflow is a later option;
- IDs are semantic and stable across beats;
- no arbitrary code, no HTML, no LaTeX, no 3D, no updaters.

### 4.2.1 Compound objects: hull + inner slots

The model must not place a compound object's inner elements. It selects a
template and fills semantic slots:

```json
{"kind":"step-card","slots":{"title":"Scale","value":"2 × 0.7 = 1.4","caption":"positive product","icon":"tools"}}
```

The compiler expands that into:

- **hull** — one canonical clockwise cubic loop: rounded rect, ring, capsule,
  axis baseline, or lane;
- **inner_slots** — icon-chip, title, value-pill, caption, bars, and other
  structured content, placed by the compound's own measured micro-layout.

A primitive is simply a compound with a hull and zero slots. This keeps
`line → step-card` a normal hull morph rather than a special case.

v1 compound templates:

`sum-node`, `step-card`, `value-pill`, `icon-chip`, `axis`, `number-line`,
`bars`, `callout`, `brace`, `comparison-card`, `trace-row`, `station`.
`dock` is a retained-context action, not a compound.

### 4.2.2 Hull + settle morph contract

Morphing a simple route into two rich step-cards must not morph fifteen inner
elements at once. Use a two-tier timeline:

| window | behavior |
|---|---|
| 0–80% of D | source hull → target hull via `attr:{d}` |
| 15–80% | shared semantic children (ship/icon) move into target slots |
| 65–100% | **new** target slots settle: opacity 0→1, translate y +6→0 |
| after D | settled-poster hold: **≥1.5 s, target 2 s** |

Rules:

- `morph(replace)` morphs the source hull and removes it after settle;
- `morph(copy)` clones the hull and shared children, preserves the source;
- the hull is behind the slots; text crossfades; icons transform, never morph;
- new slots appear only when the hull is nearly locked;
- the model supplies slot content, never inner x/y;
- the final settled state is part of the animation, not an afterthought.

### 4.2.3 Final-state contract and density gate

The compiler validates the **settled poster**, not just the moving geometry.
Grammar-specific final shapes:

| grammar | settled poster |
|---|---|
| construction/mechanism | hero + 2–4 parts + explicit relations + conclusion |
| quantitative | plot/axis/number-line + 2–3 annotations + conclusion |
| comparison | 2–4 columns + shared criteria rows + conclusion |
| procedure | 3–4 step cards + rail + result |
| algorithm | trace rows + state column + conclusion |
| narrative | axis + dated markers + captions + conclusion |
| recall | route + 3 stations + mnemonic conclusion |

Object-level “no naked boxes” rule:

- a hero or supporting node may not be a bare `rect`/`circle` with one label;
- it must carry a title plus at least one of: icon-chip, value-pill, or
  quantitative atom;
- title ≤ 28 chars, value ≤ 18, caption ≤ 65; these are early warnings, but
  **measured bbox is the truth**;
- no compound may have an empty required slot;
- a caption is an annotation, not a paragraph;
- one conclusion callout or brace must close the poster;
- docked context is required only when the beat actually references the prior
  result, not on every later beat.

A model-authored scene with six empty rectangles and a paragraph must fail at
this gate, not at review.

### 4.3 Canonical geometry and morph

Every morphable primitive lowers to a **clockwise closed cubic loop** with a
fixed segment count (8 for v1; 12 if needed).

- rect: 8 cubic segments around the perimeter;
- line: zero-thickness loop with the same 8-segment structure;
- circle/arc: 8 cubic segments approximating the curve;
- text: never path-morphed; crossfade and move the label anchor;
- icons: semantic transform (move/scale), not path morph.

Morph rules:

- `morph(replace)`: interpolate source path → target path, then remove source;
- `morph(copy)`: clone source, interpolate the clone → target, keep source;
- both shapes must share subpath and point counts;
- fill, stroke and opacity interpolate alongside `d`;
- group transforms are baked into control points before the morph; the element’s
  local transform resets to identity at morph start;
- groups match sub-objects by **ID/role**, not family order;
- geometry morphs; labels crossfade; never morph text glyphs into boxes;
- sample the morph midpoint for overlap/contrast, not only endpoints;
- compound objects use the hull + settle contract in 4.2.2; primitives remain
  hull-only.

### 4.4 Retained groups and docking

Understood context must shrink into **live, clickable working memory**:

- keep the group in the DOM;
- animate its transform to a dock slot;
- add a frame/label if needed;
- retain pointer events and inspection/branch actions;
- allow it to move again in a later beat;
- do not replace it with a baked thumbnail image.

### 4.5 Measurement and compiler placement

Write the scene compiler as a **pure TypeScript module** with injected font
metrics. It runs in two hosts:

- **browser**: preview, interaction, re-layout on viewport changes;
- **server**: a persistent Node worker called by the Python pipeline, returning
  compiled artwork and findings.

Do not implement a second Python text engine unless it is parity-tested against
the TS metrics. Fail closed if the worker is unavailable.

The compiler receives the **post-title/body art square** in pixels and its
padding. It lays out at final pixel sizes; it emits 0–100 once. It never shrinks
a measured text group to fit.

### 4.6 Pacing validator

The compiler emits timed actions. Validate before rendering:

- `startsPer10s = action starts / duration × 10`;
- `maxHold = max(next start − previous action end)`;
- `groupedOpsPer10s`;
- action durations.

Targets for process/scene beats:

- **≥ 2.0 play starts / 10 s** (reference 2.20);
- **≤ 2.5 s max still hold** (reference 1.5 s);
- **5–6 grouped ops / 10 s** (reference 5.64);
- continuous motion may run 4 s; it is not a dead hold;
- a 4–5 beat process must retain at least two groups across beats and dock at
  least one understood group;
- descriptive/card beats are exempt from the density target;
- the settled-poster hold is intentional and does not count as a dead hold;
  require ≥1.5 s, target 2 s, after the last action.

The compiler must time both the choreography and the settle. A scene that ends
with the hull morph but never holds the finished poster fails pacing.

Failures return structured findings, not a silent hold.

### 4.7 Review and gate

Three layers:

1. **Compiler geometry**: text fits, no overflow, collision findings, pacing.
2. **Browser gate** (`hyperframes check`): contrast, clipping, overflow,
   occlusion, runtime, craft on rendered frames.
3. **Strict frame reviewer** (DeepSeek): teaching/composition judgment.

For scene beats, sample:

- finished frames;
- action starts/ends;
- at least one mid-morph frame;
- the settle start and the settled-poster hold;
- docked states and retained thumbnails.

The browser gate must also run on the **settled poster**, where compound
density, contrast, clipping and occlusion are judged. The compiler density gate
checks empty slots and text-role budgets before rendering.

Do not let the gate pass on endpoints alone. A morph can be clean at both ends
and unreadable in the middle, and a scene can animate well but settle into six
empty boxes.

## 5. Phases

### P0 — Baseline (done)

- IR v0 compiler, fixtures, tests.
- Canonical 8-cubic morph pilot.
- Route split, retained dock, click test.
- Pacing readout: 6.00 starts / 10 s, 1.50 s max hold.
- Static browser gate.
- Eight hand-authored scene-grammar chapters (`?scenes=1`): construction split,
  mechanism fan-in, quantitative line/bar/ring, comparison split, procedure
  rail, algorithm trace, narrative timeline, recall route.
- Findings: labels need real centering; model is not yet authoring IR; motion
  must be enforced, not decorative. The eight scene proofs animate well but
  settle into sparse posters because the fixtures use bare primitives and no
  compound/final-state contract. That is the P1 evidence.

### P1 — Scene IR v1, compound posters, and canonical morph (done)

Deliver:

- finalize IR schema and validation limits;
- text bbox/centering with `text-anchor`; label fit inside/outside;
- arrow endpoint and label-lane rules;
- canonical path builder for line/rect/circle/arc;
- **compound templates** with hull + inner slots: sum-node, step-card,
  value-pill, icon-chip, axis, number-line, bars, callout, brace,
  comparison-card, trace-row, station; `dock` remains an action;
- **hull + settle** morph: hull 0–80%, shared children 15–80%, new slots
  65–100%, settle hold ≥1.5 s;
- **final-state contract and density gate**: grammar-specific poster shape, no
  naked boxes, required slots, measured text-role budgets, conclusion callout;
- one reference settled poster per teaching grammar;
- `morph replace|copy`, `dock`, `move`, `scale`, `indicate`;
- transform baking and semantic group matching;
- collision pass and overflow findings;
- compiler tests: same segment count, no twist, endpoints, text floor, pacing,
  empty-slot rejection, no-naked-box rejection, settle hold.

Acceptance:

- route line → two compound step-cards with hull morphs and settled slots;
- labels remain readable at the final viewport;
- copy/replace semantics pass visual and structural tests;
- docked group remains clickable;
- a scene with two empty boxes and a label is rejected before rendering;
- a 40-word caption is rejected;
- the settled poster holds long enough to read;
- pacing validator rejects dead holds and too-few play starts.

### P1 status — implemented

The P1 layer is now in the tree and gated:

- `visual-studio/src/live/compounds.ts` — hull + inner-slot layout for
  comparison-card, step-card, sum-node, value-pill, icon-chip, axis,
  number-line, bars, callout, brace, trace-row and station;
- `visual-studio/src/live/sceneProgram.ts` — model-facing IR, compound
  expansion, poster placement, hull/settle timing, measured text budgets,
  criteria sharing, naked-box/empty-slot rejection, settle hold and pacing;
- eight reference settled posters at `?posters=1` (comparison, procedure,
  algorithm, narrative, recall, quantitative, construction, mechanism);
- reference comparison at `?reference=1`, captured model output at `?model=1`;
- `bench/model_scene_test.py` — repeated route → comparison test, no hand
  edits, same compiler and gate;
- `bench/settled_poster_check.py` — browser gate on the settled poster;
- descriptive slots `formula`, `detail`, `badge`, `note` let a beat carry the
  old equations and explanations without abandoning the dense poster.

Evidence:

- Muse and DeepSeek each passed the model-authored comparison gate **3/3**;
  both filled shared criteria rows, used replace + copy, docked the retained
  context, and settled into a readable poster;
- all eight reference posters compile and pass the settled-poster browser gate
  with **0 errors and 0 warnings**;
- 64 TypeScript tests and 427 Python tests pass;
- a bare rect, an empty compound, a criteria mismatch, a missing dock, a
  short settle hold and prose-stuffed slots are rejected before rendering.

The model still needs prompt/examples rather than free coordinates. P2 (shared
compiler worker) and P4 (full motion gate) are not done. P3 has a working live
slice and beats 4–8 now exist as scene programs in that player. Production
payload generation, narrated audio and rollout remain.

### P2 — Shared compiler worker

Deliver:

- persistent Node JSON-RPC worker;
- Python integration for validation/compilation;
- browser use of the same module;
- version pin, timeout, fail-closed behavior;
- metrics parity tests against the renderer.

Acceptance:

- same IR + viewport produces identical artwork in Node and browser;
- Python cannot publish a scene the browser would render differently;
- worker cold start does not affect per-node latency.

### P3 — Live scene engine integration

Deliver:

- `engine: 'scene'` on chapters (or a `visual.scene` payload);
- one player clock for scene and card chapters;
- audio cue retiming across both;
- navigation, pause/seek, ask/branch on scene objects;
- retained groups across beats;
- scene/card transitions with shared example, palette and typography.

Acceptance:

- one lesson contains a scene construction beat and a card descriptive beat;
- audio and visuals stay aligned;
- scene objects are inspectable;
- no per-chapter video seam.

### P3 status — vertical slice implemented

- `LiveChapter.scene?: SceneProgram` carries a model-facing scene payload;
- `SceneChapterStage` compiles it through the same gate and seeks the scene
  timeline from the lesson clock;
- `SceneStage` now accepts `time`, `selected` and `onSelect`, so it can be
  driven by the player instead of its own autoplay;
- `?sceneDemo=1&muted=1` is a two-chapter lesson: a construction scene, then a
  card beat, in the real `LiveLessonPlayer`;
- clock sync measured: head `6.000 → 8.167 → 10.684`, scene timeline
  `6.000 → 8.166 →` chapter switch; the card beat then takes over;
- the scene chapter holds its settled poster through `9.1`; the card chapter
  starts at `9.6`, so the boundary is not a blank frame;
- scene chapters are excluded from `GeneratedStage`, so they cannot ghost
  through the next card chapter's cross-fade;
- morph-copy clones are tracked and removed on chapter change, and
  `SceneStage` is keyed by chapter id, so a copied card cannot leak into a
  later beat;
- clicking the scene's `inputs` node sets the player selection to `inputs`;
- `?methodsDemo=1&muted=1` runs **five scene chapters** — comparison,
  procedure, algorithm, narrative and recall — as beats 4–8 on one clock;
- `?beats=1` is the standalone gallery for those five programs;
- playback crossed comparison → procedure at `7.5 → 10.58` with exactly one
  scene stage mounted at a time;
- `bench/live_scene_check.py` passed the live scene at mid-morph (`t=2.2`) and
  settled (`t=8.4`), and the card chapter at `t=16.8`, all with **0 errors and
  0 warnings**;
- all five beats 4–8 pass the live browser gate at mid-morph and settled state
  (**10/10 frames, 0 errors, 0 warnings**).

Still open for P3 production:

- the normal lesson pipeline must emit `scene` payloads and stream/gate them;
- the demo runs muted, so narrated scene audio sync still needs a real audio
  track;
- focus/zoom on scene objects is disabled; selection and ask-context work, but
  the camera focus path is still card-only;
- retained groups across beats and scene/card transition polish are not
  authored beyond the demo;
- P4 still needs the automated merge/revision loop and action-boundary
  sampling; the manual mid-morph and settled checks now exist.

### P4 — Motion and settled-poster gate

Deliver:

- pacing gate in the compiler, including settle hold;
- action-boundary, mid-morph, settle-start and final-poster sampling;
- density gate at the compiler boundary and browser gate;
- extend `hyperframes_check` to sample specified times;
- merge compiler, browser and reviewer findings into one revision request;
- capped revision loop.

Acceptance:

- a dead 5 s hold is rejected before rendering;
- a mid-morph label collision is caught;
- an empty compound or naked hero box is rejected before rendering;
- a settled poster holds ≥1.5 s and passes contrast/overflow;
- a blocked chapter is revised and re-gated;
- no unreviewed scene is published.

### P4 status — partial

- the compiler rejects dead holds, short settle holds, empty slots, naked
  boxes, criteria mismatches and prose-stuffed slots;
- `bench/live_scene_check.py` samples a chosen live frame through the
  HyperFrames contrast/layout gate;
- beats 4–8 were sampled at mid-morph and settled state in `?methodsDemo=1`:
  **10/10 frames, 0 errors, 0 warnings**;
- the five latest model-authored beats were gated from the streaming page:
  **5/5 frames, 0 errors, 0 warnings**;
- the demo's scene→card boundary was checked at `9.1` and the card at `16.8`;
- `?factory=1` streams model-authored beats; the latest run produced all five
  method beats in **56.8 s total** (4.9–20.7 s each) with no repaint.

Still open: one command that merges compiler, browser and reviewer findings
into a revision request, a capped revision loop, action-boundary sampling for
every beat, and wiring the live gate into chapter streaming.

### P5 — Model-authored scene IR

Deliver:

- planner prompt for compound scene IR: choose template + slots + relations,
  not inner coordinates;
- few-shot route→comparison with hull morph, settle and retained dock;
- model output validation and repair hints;
- controlled test on **one** scene: route → two comparison cards;
- compare against the hand-authored pilot and the primitive chapters;
- benchmark on construction, mechanism, quantitative.

Acceptance:

- the model emits valid IR for the pilot scene without hand edits;
- it chooses `morph copy`/`replace` and `dock` correctly;
- it fills title/value/caption slots with evidence, not paragraphs;
- the settled poster passes the density gate;
- first-pass gate/review improves over raw coordinates;
- no regression in card beats.

If the model fills boxes with prose or leaves slots empty, add examples and
repair hints, not more primitives.

### P5 status — streaming factory implemented

The factory is now a live path, not a one-off test:

- `?factory=1` starts a job and streams `beat_start`, `repair`, `compiled` and
  `done` events over SSE;
- the model returns **slot JSON only** — cards, steps, rows, stations and a
  conclusion; Python assembles the SceneProgram; the compiler owns hulls,
  badges, inner layout and timing;
- rich slots (`formula`, `detail`, `badge`, `note`) are in the compiler and in
  the prompt, so the model writes equations and explanations, not summaries;
- the factory enforces a descriptive-slot check before compilation and allows
  one repair with the exact findings;
- word-safe clipping on captions/details prevents a full model round-trip for
  a one-character overflow;
- latest streaming run: **5/5 first-pass**, **56.8 s total**, **4.9–20.7 s per
  beat**; the clean CLI run was **103.8 s total**, **9.6–29.5 s per beat**;
- all five model-authored beats passed the live browser gate with **0 errors
  and 0 warnings**.

Still open for production: feed real lesson briefs and source evidence, keep
audio in the same stream, run the browser gate inside the factory before
publishing, and connect the factory to the live lesson store instead of the
demo gallery.

### P1 execution order

Do these in order; each one has a test before the next:

1. **Freeze the IR contract.**
   - primitive and compound schemas;
   - required/optional slots;
   - `engine`, `teaching`, `layout` validation;
   - object/op/text limits.
2. **Compound expansion.**
   - `step-card`, `sum-node`, `value-pill`, `icon-chip`, `axis`,
     `number-line`, `bars`, `callout`, `brace`, `comparison-card`,
     `trace-row`, `station`;
   - hull + measured inner slots;
   - the model never supplies inner x/y.
3. **Hull + settle morph.**
   - 0–80% hull, 15–80% shared children, 65–100% new slots;
   - replace/copy;
   - transform baking;
   - settle hold ≥1.5 s.
4. **Final-state contract.**
   - grammar-specific poster shape;
   - no naked boxes;
   - required slots non-empty;
   - measured text-role budgets;
   - conclusion callout;
   - conditional docked context.
5. **Reference posters.**
   - one settled reference per grammar;
   - store the object graph, slots, relations and final bbox/density;
   - use them as few-shot examples, not as templates to copy blindly.
6. **Pacing and density gates.**
   - starts/10 s, max hold, settle hold;
   - empty-slot and no-naked-box rejection;
   - text fit and contrast;
   - mid-morph and settled-poster sampling.
7. **Model harness.**
   - one task: route → two comparison cards;
   - same compiler, same gate, no hand edits;
   - repeated attempts until the stopping criteria are met.

### Model-test protocol

The model test is a loop, not a one-off demo.

**Task**

> Given the route → two-card comparison fixture, emit scene IR with a hull
> morph, a copy split, a retained dock, and filled slots.

**Models**

- `opencode-go/muse-spark-1.3-contributor`
- `opencode-go/deepseek-v4.1-flash`
- Gemini when quota permits

**Fixed conditions**

- same IR schema and compiler version;
- same viewport and font;
- same reference examples;
- no hand edits to model output;
- strict reviewer is DeepSeek, not the contender.

**Metrics**

- valid IR on first response;
- hull morph + copy split correct;
- number of empty slots / naked boxes;
- text-role overflows;
- final poster density gate;
- strict reviewer approval;
- revisions required;
- time to first valid scene.

**Failure taxonomy**

- schema violation;
- wrong topology (chained inputs, missing hub);
- empty compound / naked box;
- prose stuffed into a slot;
- label overflow;
- morph not settled / no hold;
- teaching/poster mismatch.

**Loop**

1. Run the task.
2. Classify failures.
3. Fix the **compiler/contract** first, then the prompt/examples.
4. Re-run the same task.
5. Stop when 3 consecutive runs pass all gates, or after 6 runs if the
   failures are model-capability limits rather than contract gaps.

**Rollout gate**

Beats 4–8 are not implemented until the model-authored route → comparison
scene passes the settled-poster gate. A nice animation without a dense final
poster does not count.

### P6 — Rollout and cleanup

- feature flag per grammar;
- deprecate static-only process scenes;
- document the IR and compiler;
- telemetry: engine, ops, pacing pass/fail, revision count, gate findings;
- keep the Manim source as a design reference, not a runtime.

## 6. Non-goals

- Running Manim, Cairo, LaTeX or ffmpeg in the live path.
- Baking process beats to MP4 and mixing video with live HTML.
- Full Manim API coverage.
- 3D, updaters, arbitrary Python, arbitrary paths/HTML.
- Morphing text glyphs into geometry.
- Pixel-perfect Manim parity; our measurements and font are the truth.

## 7. Risks

| risk | mitigation |
|---|---|
| Measurement drift between compiler and renderer | one TS compiler, injected metrics, parity tests |
| Morph twisting/self-intersection | canonical clockwise loops, equal segment counts, midpoint checks |
| Group transform origin jumps | bake affine transforms into control points |
| Text becomes unreadable when scaled | viewport-first measurement, pixel floor, reject uniform text scaling |
| Scene/card seam | shared example, palette, font, transitions, one clock |
| Gate only sees endpoints | action-boundary and mid-morph sampling |
| Pacing validator forces motion for its own sake | apply density only to process/scene beats |
| Model picks wrong ops | typed IR, pairing rules, compiler findings, revision loop |
| Model fills compound slots with prose | title/value/caption caps, measured bbox, density gate |
| Model places inner coordinates and drifts | compound owns micro-layout; model supplies slots only |
| Density gate rewards decoration | require semantic slots and a conclusion, not icon count |
| Forced thumbnails on every beat | dock only when the current beat references the prior result |
| Final poster looks empty after a good morph | hull + settle + final-state contract, hold ≥1.5 s |
| Scope creep into a second renderer | compile to the existing SVG/GSAP primitives; no IR runtime |

## 8. Immediate next actions

1. Freeze the IR v1 schema: primitives, compound templates, required slots.
2. Implement hull + settle: hull 0–80%, shared children 15–80%, slots
   65–100%, hold ≥1.5 s.
3. Implement the final-state contract and density gate.
4. Fix text centering and label-fit rules; measured bbox is the truth.
5. Add one reference settled poster per grammar.
6. Add the pacing gate and settle hold.
7. Run the browser gate at mid-morph, settle start and final poster.
8. Only then give the model the route→comparison IR and benchmark it.

## 9. File map

- `visual-studio/src/live/ir.ts` — IR compiler (v0).
- `visual-studio/src/live/ir.fixtures.ts` — scene fixtures.
- `visual-studio/src/live/morph.ts` — canonical loops and pacing.
- `visual-studio/src/live/MorphPilot.tsx` — standalone morph proof.
- `visual-studio/src/live/scene.ts` — scene IR types.
- `visual-studio/src/live/SceneStage.tsx` — scene timeline renderer.
- `visual-studio/src/live/methodsScenes.ts` — eight hand-authored primitive scenes.
- `visual-studio/src/live/methodsPrograms.ts` — beats 4–8 as compound programs.
- `visual-studio/src/live/methodsDemoLesson.ts` — five scene chapters at `?methodsDemo=1`.
- `visual-studio/src/live/SceneChapterStage.tsx` — scene chapter in the live player.
- `visual-studio/src/live/MethodsPrograms.tsx` — beat gallery at `?beats=1`.
- `bench/live_scene_check.py` — browser gate for a live scene frame.
- `src/assistant/visual/beat_factory.py` — model slot factory and SSE stream.
- `visual-studio/src/live/BeatFactory.tsx` — streaming beat page at `?factory=1`.
- `bench/beat_factory_stream.py` — CLI stream reproducer.
- `visual-studio/scripts/ir_lesson.ts` — IR lesson builder.
- `bench/hyperframes_check.py` — static browser gate.
- `src/assistant/visual/browser_gate.py` — server gate.
- `src/assistant/visual/browser_lessons.py` — streaming/gate integration.
- `visual-studio/src/live/ChapterStream.tsx` — per-chapter gate viewer.
- `docs/visual-hybrid-plan.md` — prior grammar/teaching plan.
- `docs/visual-generation-retrospective.md` — evidence and failures.

## 10. Definition of done

The plan is complete when a live lesson can:

- choose scene vs card per chapter from `teaching`;
- compile a model-authored scene IR with measured text, compound objects and
  relational layout;
- split an object with a real cubic morph and retain a docked, clickable group;
- settle into a dense, readable poster with no naked boxes or prose-stuffed
  containers;
- pass pacing, density, geometry, contrast, mid-morph and settled-poster gates;
- keep audio, navigation and interaction aligned across both grammars;
- prove this on one scene construction beat plus one descriptive card beat,
  without an MP4 seam or a second renderer.
