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
- sample the morph midpoint for overlap/contrast, not only endpoints.

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
- descriptive/card beats are exempt from the density target.

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
- docked states and retained thumbnails.

Do not let the gate pass on endpoints alone. A morph can be clean at both ends
and unreadable in the middle.

## 5. Phases

### P0 — Baseline (done)

- IR v0 compiler, fixtures, tests.
- Canonical 8-cubic morph pilot.
- Route split, retained dock, click test.
- Pacing readout: 6.00 starts / 10 s, 1.50 s max hold.
- Static browser gate.
- Findings: labels need real centering; model is not yet authoring IR; motion
  must be enforced, not decorative.

### P1 — Scene IR v1 and canonical morph (next)

Deliver:

- finalize IR schema and validation limits;
- text bbox/centering with `text-anchor`; label fit inside/outside;
- arrow endpoint and label-lane rules;
- canonical path builder for line/rect/circle/arc;
- `morph replace|copy`, `dock`, `move`, `scale`, `indicate`;
- transform baking and semantic group matching;
- collision pass and overflow findings;
- compiler tests: same segment count, no twist, endpoints, text floor, pacing.

Acceptance:

- route line → two rect lanes with no self-intersection;
- labels remain readable at the final viewport;
- copy/replace semantics pass visual and structural tests;
- docked group remains clickable;
- pacing validator rejects dead holds and too-few play starts.

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

### P4 — Motion gate and auto-revision

Deliver:

- pacing gate in the compiler;
- action-boundary/mid-morph sampling;
- extend `hyperframes_check` to sample specified times;
- merge compiler, browser and reviewer findings into one revision request;
- capped revision loop.

Acceptance:

- a dead 5 s hold is rejected before rendering;
- a mid-morph label collision is caught;
- a blocked chapter is revised and re-gated;
- no unreviewed scene is published.

### P5 — Model-authored IR

Deliver:

- planner prompt for scene IR (10 objects, 7 ops);
- few-shot route→comparison and thumbnail examples;
- model output validation and repair hints;
- benchmark on the same three beats (construction, mechanism, quantitative);
- compare model IR against model primitive chapters and curated IR.

Acceptance:

- the model emits valid IR for the pilot scene without hand edits;
- first-pass gate/review approval improves over raw coordinates;
- the model chooses `morph copy` for a split and `dock` for retention;
- no regression in card beats.

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
| Scope creep into a second renderer | compile to the existing SVG/GSAP primitives; no IR runtime |

## 8. Immediate next actions

1. Freeze the IR v1 schema and limits.
2. Fix text centering and label-fit rules in `ir.ts`.
3. Add `morph`, `dock`, `indicate` to the scene IR and compiler.
4. Move the pilot's route→comparison into the compiler as a fixture, not a
   standalone hand-built SVG.
5. Add the pacing gate to compilation.
6. Run the browser gate at `mid-morph` and action boundaries.
7. Only then give the model the IR and benchmark it.

## 9. File map

- `visual-studio/src/live/ir.ts` — IR compiler (v0).
- `visual-studio/src/live/ir.fixtures.ts` — scene fixtures.
- `visual-studio/src/live/morph.ts` — canonical loops and pacing.
- `visual-studio/src/live/MorphPilot.tsx` — standalone morph proof.
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
- compile a model-authored scene IR with measured text and relational layout;
- split an object with a real cubic morph and retain a docked, clickable group;
- pass pacing, geometry, contrast and mid-morph gates;
- keep audio, navigation and interaction aligned across both grammars;
- prove this on one scene construction beat plus one descriptive card beat,
  without an MP4 seam or a second renderer.
