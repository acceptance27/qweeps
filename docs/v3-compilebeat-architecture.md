# v3 Frozen Architecture Spec — compileBeat

Status: frozen for implementation. No code in this document.
Scope: the `/ask` generated-scene pipeline (Phase 1) and the
`browser_lessons` live pipeline (Phase 2). v2 lessons remain supported.

> **Update 2026-10-31:** the compiler, gate and invariants in this spec remain
> the target. Free-coordinate authoring (20–40 elements per beat) is retired as
> a generation format; generated lessons use the live layout schema. See
> `docs/visual-schema-decision.md`.

## 1. Problem

The "How do LLMs work?" benchmark failed for DeepSeek V4.1 Flash (0/5) and
MiMo V2.6 Flash (0/3) while Gemini 3.8 Flash High succeeded. Failures fell into
five classes:

| class | failure |
|---|---|
| A | contract/omission: prose instead of JSON, empty `answer`, missing evidence, `svg: null` |
| B | long-prompt cliff: zero output in 900 s on 65k prompts |
| C | spatial/encoding: inconsistent bar scales, narrow labels, missing connectors, colour reuse |
| D | teaching sequence/scaffolding: result before cue, parts without the whole |
| E | harness defects: v1 `step_finish`, 300 s cap, vague SVG errors, `stroke-dasharray` rejection, duplicate generated IDs, invalid review JSON, self-review |

Structural costs: one monolithic 6-beat director call, full-scene revisions, an
all-or-nothing approval gate.

## 2. Thesis

Move deterministic invariants out of the model into a compiler:

- geometry (bars, labels, connectors) → `bars`, `links`, `svgRef`
- identity (colour) → `semanticRole` + palette + `focusState`
- ordering → cue-anchored timing + DAG lowering
- scaffolding → `derivedFrom` + parent provenance
- layout → compiler-owned text metrics and camera projection

Then decompose generation:

```
Stage 1A (narrative, cues, roleTable)
  → Stage 1B (topological stateContract)
  → per-beat Director (lean prompt + boundary snapshot)
  → compileBeat (pure)
  → Stage 1 deterministic gate
  → Stage 2 tiered semantic review (pipelined)
  → final holistic review
```

## 3. Authoring vs compiled

- `AuthoringBeat` is the only document the model reads and writes: `bars`,
  `links`, `svgRef`, `derivedFrom`, `semanticRole`, `focusState`, timing
  expressions, `parentId`, `defaults`.
- `CompiledBeat` is a pure derived artifact consumed by HyperFrames/Manim.
- `compileBeat(authoring, prevSnapshot, lessonSpec, contract) →
  { compiled, nextSnapshot, provenance }`.
- `provenance: Record<CompiledId, { authoringId, path }>`.
- Generated IDs use `b{beatIndex}__gen__{parentId}__{slot}`, matching
  `[A-Za-z0-9_]+`. Model-authored IDs may not start with `b\d+__gen__`.
  Slashes are forbidden: they break unescaped GSAP/CSS selectors.

## 4. Authoring primitives

### Roles and palette
- Planner declares a lesson-scoped `roleTable` (domain roles) mapped to a fixed
  colourblind-safe palette with non-hue discriminators (border, shape, badge).
- `focusState` (`normal|highlight|muted|error`) is orthogonal to identity and
  controls opacity/stroke/glow, never hue.
- Role mutation is an instant snap at the beat boundary by default; a
  cue-triggered cross-fade is allowed and must finish before the next cue.

### Bars
- `kind:"svg"` with `bars:[{label,value}]`; the compiler draws all bars on one
  absolute 0–1 scale, with a fixed label gutter and generated value labels.
- The model never places bar rectangles or value labels.

### Links and assets
- `links:[{from,to,label}]` at beat level; missing connectors are generated.
- `svgRef` reuses an earlier SVG asset; identical markup is not re-emitted.

### derivedFrom, parentId
- `derivedFrom:<parentId>` for parts; the gate verifies the parent exists (or
  entered earlier), a reading-time floor `max(0.8s, len(label) × 0.075s)`, and
  frustum visibility.
- `parentId` is compiler-assigned for macros (`bars`, `derivedFrom`) and
  authorable only for explicit groups. Validate existence, no cycles, container
  overflow. Parent-child overlap exemptions are provenance-based; sibling
  labels are still checked.

### Timing grammar
- Absolute floats remain for `beatDuration`, camera, TTS word times.
- Element timing uses `after:cue.<id>+0.2`, `with:cue.<id>`,
  `after:el.<id>.end`, `with:pass.<id>[n].start`.
- Cue grammar: `[cue:id]`, `[a-z0-9_]+`, at word boundaries, stripped before
  TTS. Multiple cues on one word share a timestamp and dedupe by ID.
- Cue IDs are immutable across a Stage 1A factual repair; new cues may be added;
  removing a referenced cue requires explicit re-anchoring.
- Loops are finite macros: `{id, t_start, passes, passDuration}` unrolled into
  concrete pass intervals.
- The compiler runs a Kahn topological sort per beat and rejects cycles,
  dangling anchors, and unresolved symbols before rendering.

### Sync and draw caps
- Cue-anchored start window: `[-0.1s, +min(0.8s, next_cue_gap / 2)]`. The final
  cue of the final beat includes the 1.0 s tail in `remaining_beat_audio / 2`.
- Draw duration caps (reveal/construction, not visibility):

  | kind/role | cap | floor |
  |---|---|---|
  | text, label, badge, sampled_output | 0.6 s | 0.15 s |
  | box, circle, arrow, line, path | 1.5 s | by segment count |
  | svg illustration | 2.5 s | by path length |
  | traced construction | 2.5 s | by segments + length |
  | default | 1.2 s | 0.3 s |

- Inference completion: every inference-critical element completes drawing
  before its next dependent cue. Clamp above the complexity floor → ADVISORY;
  tighter than the floor → `SYNC_VIOLATION` (BLOCKER).

## 5. Text, camera, overlap

- `compileBeat` owns wrapping and shrink-to-fit. v3 renderer uses `fit:"none"`;
  v2 keeps runtime fit. Measurements are cached by
  `(font, size, text, box)` with a pinned font/container/wrapping algorithm and
  golden layout tests. The compiled text representation must carry explicit
  `lines` and `fontSize`.
- Camera: shared easing registry and transform origin between compiler and
  GSAP. Sample analytic projection at cue times, element keyframes, camera
  keyframes, plus 0.1 s normal motion and 0.05 s during fast zoom
  (`|Δzoom|/Δt > 0.4/s`) or fast pan (`> 0.5 viewport_widths/s`).
- Overlap: camera-projected screen-space boxes, intersection / min(area) > 8%.
  Exempt provenance-related pairs and container children; check siblings.
  Text occlusion, label overflow, and container overflow are blocking;
  boundary crowding escalates at most one beat upstream.

## 6. Clock, holds, navigation

The renderer exposes `allowOverlap: boolean` in its health/manifest.

### browser_lessons (single performance, allowOverlap: true)
- One lesson-wide recording: 0.3 s lead + performance + 1.0 s tail. Divided at
  natural gaps; never paused at beat boundaries; never spliced with per-beat
  silence. `compileBeat` owns visual spans, not audio duration.
- Holds are overlaps: Beat *i* may extend `visualEnd_i` past
  `visualStart_{i+1}`, bounded by the first cue in Beat *i+1* that claims the
  region (or an explicit clear). Cross-beat checks are time-scoped to
  `[visualStart_{i+1}, visualEnd_i]`.
- Only the final beat may consume or extend the tail.

### /ask (synthetic clock, allowOverlap: false)
- Visual spans are a strict partition (`visualEnd_i = visualStart_{i+1}`),
  matching `planBeat()`'s single-active-beat renderer.
- Holds are retention: held elements are carried into Beat *i+1*'s snapshot
  (same IDs, positions, roles) and dropped or dimmed at the first cue that
  claims the region.

### Mutual exclusion
Across any transition, an element is either held by overlap (stays in Beat *i*,
omitted from *i+1*) or retained into *i+1* (spans partitioned), never both.

### Boundary snapshot
Carries retained `[x, y, w, h]`, `semanticRole`, label, camera,
`visualStart`, `visualEnd`, `narrationAt`, and `cueTimes`.

### Current chapter
`latest beat where time >= (visualStart ?? start)`. Ownership changes at the
next `visualStart`; `visualEnd` is only a fade-out time. This preserves
`navigation.ts` semantics under overlap.

### Alignment tiers
- High ≥ 0.75: normal bounds.
- Mild 0.45–0.75: widen sync tolerance ±0.2 s, warn.
- Severe < 0.45: retry once, then reject. Severe maps to the existing
  `assemble_lesson` gate (< 0.8 matched coverage, or unmatched first/last 3
  words).

## 7. Review and gate

### Stage 1 — deterministic (blocking, < 50 ms)
Schema, IDs, evidence, anchors, cue DAG, draw caps, containment, text
occlusion, contract preservation. Emits a closed error class:

`TEXT_OCCLUSION`, `LABEL_OVERFLOW`, `TIMING`, `SYNC_VIOLATION`, `ROLE_STYLE`,
`CONTAINER_OVERFLOW`, `BOUNDARY_INFEASIBLE`, `MISSING_EVIDENCE`.

`(compiledId, errorClass) → { writablePaths, forbiddenPaths, hint }` via
provenance. Upstream compaction is capped at one beat.

### Stage 2 — semantic (tiered)
Three buckets:

1. `NARRATION_FACTUAL_BLOCKER`: contradicts a supplied source or the lesson's
   own stated mechanism; must cite the contradiction. BLOCKER; triggers one
   Stage 1A repair → re-TTS (browser_lessons) → deterministic re-lower.
2. `VISUAL_CONTRADICTS_NARRATION`: narration true, visual wrong. BLOCKER;
   visual revision only.
3. `NARRATION_STYLE_ADVISORY`: pacing/phrasing/emphasis, or unsourced claims
   without a supplied source. ADVISORY.

Advisories never block approval; factual benchmarks must supply source material.

### Judge
External non-contender, blind, fixed across contenders. Log `judge_model`.
Self-review is not used for benchmarking.

### Pipelining guards
- **Lookahead cap = 1 beat:** Beat *i+1* directorial work may start after Beat
  *i* passes Stage 1; Beat *i+2* waits for Beat *i*'s Stage 2 to return no
  BLOCKER. On a Beat *i* BLOCKER, cancel in-flight *i+1* work and invalidate
  only *i+1*. `exitSnapshotHash` covers only fields that affect *i+1*
  (retained boxes, roles, camera, cue times).
- **Holistic review targeting:** the final review may emit ADVISORY findings or
  a BLOCKER pinned to `(beatIndex, compiledId, errorClass)`, re-running that
  beat (plus *i+1* only if the exit hash changes). Unlocalizable findings are
  ADVISORY or routed to a bounded Stage 1A/1B planner repair, never a
  full-scene rewrite.

## 8. v3 envelope

```json
{
  "schemaVersion": 3,
  "authoringSha256": "...",
  "spec": { "roleTable": {}, "cueTimes": {} },
  "authoringBeats": [],
  "compiledScene": {}
}
```

- `lesson.json` is untouched; the envelope lives beside it.
- `compiledScene` is a pure derived artifact. Manual edits are disallowed; all
  edits are authoring changes. `authoringHash` mismatch recompiles on load.
- Canonical hash: SHA-256 over UTF-8 NFC JSON, `sort_keys=True`,
  separators `(",", ":")`, floats to 6 decimals, `-0.0 → 0.0`, non-finite
  floats rejected.
- `validate_svg` applies to model-authored illustrations only.
  `validate_compiled_svg` guards compiler output (no scripts, URLs, external
  refs) with golden tests for IDs, escaping, hatch bounds, and no cross-beat
  `<defs>` collisions.

## 9. Non-goals and limits

- The compiler cannot make a Flash-tier model choose the right teaching move.
  It converts *declared* errors into impossible states; semantic judgement
  remains model-bound.
- Phase 1's synthetic clock means timing findings are estimates unless a
  measured per-beat clock is added.
- Unsourced factual claims are advisory; quality claims require supplied
  sources.
