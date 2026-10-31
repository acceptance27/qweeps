# v3 Execution Plan — compileBeat

Companion to `docs/v3-compilebeat-architecture.md`. This plan assumes the frozen
architecture spec and does not re-open design decisions.

> **Update 2026-10-31:** implementation status and the rendering decision are in
> `docs/visual-schema-decision.md`, and the full attempt log is in
> `docs/visual-generation-retrospective.md`, and the proposed next pipeline is
> `docs/visual-hybrid-plan.md`. The compiler/gate work continues;
> the free-coordinate DSL is not the generation path for published lessons.

## 0. Acceptance criteria

**Mechanical track (hard prompt, e.g. "How do LLMs work?")**
- Zero A/B/C/E-class failures in the failure corpus.
- No per-call timeout on any prompt under 20k tokens.
- Bar/role/connector/dependency invariants cannot be violated by construction.
- One failing beat does not invalidate approved beats.
- p50 ≤ 8 min at judge concurrency ≥ 2; ≤ 11 min with serial review; p90 ≤ 12 min.

**Quality track (proven topic + supplied source)**
- External non-contender judge; blind; fixed across contenders.
- Report approval, blockers, advisories, wall time, calls, token estimates.
- Hard stop after N runs per model; no tuning loops against a model ceiling.

## 1. Work breakdown

Estimates in engineer-days (ED). "Landed" means present in the working tree and
covered by tests, not committed or benchmarked.

### Phase 0 — Freeze, fixtures, measurement (5 ED)

| ID | task | state |
|---|---|---|
| P0.1 | Freeze architecture + execution plan in `docs/` | done (this document) |
| P0.2 | Failure corpus: 8 runs' prompts, outputs, findings, timings as fixtures | done (`tests/fixtures/failures`) |
| P0.3 | Telemetry v1: mode, clock, route, model, wall_s, calls, outcome, provider_tokens, tokenizer_est, reasoning_tokens, blockers/advisories, clamped_draws, tts_confidence, judge_model, lookahead_depth, invalidations, cancelled_reviews | partial (chars/model/seconds/ok) |
| P0.4 | External judge harness: blind, fixed non-contender, rubric v3, optional two-judge intersection | done as a module (frames pending) |
| P0.5 | Benchmark driver: isolated config, sequential runs, artifacts | done (`bench/run_lesson.py`) |
| P0.6 | Baseline: Gemini 3.8 Flash High on the same prompt | not started |
| P0.7 | AuthoringBeat schema smoke test: DeepSeek, MiMo, Muse Spark 1.3 Contributor | done (2/2 each; see §8) |

**Gate G0:** reproducible baseline; smoke test ≥ 4/5 valid per model and ≥ 80%
required fields, else simplify the DSL before P2.

### Phase 1 — Harness correctness and cheap recovery (5 ED)

| ID | task | state |
|---|---|---|
| P1.1 | OpenCode v2 completion (stream end + exit code) | landed |
| P1.2 | Precise validators (missing vs oversized, attribute names, field ids) | landed |
| P1.3 | JSON extraction + cheap recovery for prose/fenced replies | landed |
| P1.4 | Generic field patcher for `answer`, `evidence`, `svg`, `bars` (not v2-specific) | partial |
| P1.5 | ID scrubber/validator for `b{beat}__gen__` (v3 primitive) | partial |
| P1.6 | SVG whitelist (`stroke-dasharray/dashoffset/miterlimit`) scoped to authored illustrations | landed |
| P1.7 | Lean per-stage skill, compact review payload, MCP disabled | landed |
| P1.8 | Per-call telemetry | landed |

P1.4/P1.5 are scoped to reusable v3 primitives. Any temporary v2 shim carries a
deletion ticket for G4.

**Gate G1:** reusable harness invariants verified on the corpus; no bespoke v2
repair logic beyond the shim.

### Phase 2 — Authoring DSL primitives (7 ED)

| ID | task |
|---|---|
| P2.1 | `roleTable` + 8-slot palette + `focusState` + non-hue discriminators |
| P2.2 | `bars` spec + generated labels + absolute scale + gutter (landed partially) |
| P2.3 | `links` auto-connectors (landed partially) |
| P2.4 | `svgRef` reuse (landed) |
| P2.5 | `derivedFrom` + reading-time floor + frustum visibility |
| P2.6 | `parentId` containment, cycles, overflow |
| P2.7 | Timing grammar (`after/with`, cue/el/pass), bounded loops, Kahn gate, lowering |
| P2.8 | Omission rules: effect roles need non-root anchors; final-cue tail |

Bars/links/svgRef/defaults and a 40-element safety cap already exist; P2 completes the set.

**Gate G2:** authoring fixtures compile; property tests for scale, role
uniqueness, dependency order, loop bounds, ID regex.

### Phase 3 — compileBeat and compiled contract (8 ED)

| ID | task |
|---|---|
| P3.1 | `AuthoringBeat`/`CompiledBeat` types + `compileBeat(...)` |
| P3.2 | `b{beat}__gen__{parent}__{slot}` namespace + provenance |
| P3.3 | `validate_compiled_svg` + golden tests |
| P3.4 | Text metrics: pinned font, wrapping, `lines`/`fontSize`, `fit:"none"` v3 |
| P3.5 | Camera projection, easing registry, sampling |
| P3.6 | Overlap solver: containment/sibling exemptions, time-scoped windows |
| P3.7 | v3 envelope, canonical hash, recompile policy |
| P3.8 | v2/Manim compatibility |

**Gate G3:** golden compiled scenes; selector-safety tests; `exitSnapshotHash`
defined.

### Phase 4 — Generation loop, `/ask` first (9 ED)

| ID | task |
|---|---|
| P4.1 | Stage 1A: narration + cues + beat split + roleTable + `_signature` dedup |
| P4.2 | Stage 1B: `retain/mutate/enter/exit`, `encoding`, `appendTo`, `cameraIntent` + linter |
| P4.2b | Contract linter requires cue anchors for effect roles and `derivedFrom` for part roles |
| P4.3 | Per-beat director: lean ~6.5k prompt + digest |
| P4.4 | Boundary snapshot with retained boxes, roles, labels, camera, spans, cues |
| P4.5 | Retention holds (`allowOverlap:false`) + hold/retain exclusion |
| P4.5a | Lookahead cap = 1; *i+2* waits for *i* Stage 2 pass; cancel in-flight *i+1* on invalidation |
| P4.6 | Synthetic clock (or measured per-beat clock — decision P6.1) |
| P4.7 | Assembly + per-beat retries |

**Gate G4:** end-to-end `/ask` with mocked model; one real single-beat; one full
lesson; measured lookahead and p50/p90.

### Phase 5 — Gate and review (5 ED)

| ID | task |
|---|---|
| P5.1 | Deterministic Stage 1 gate (closed error classes, < 50 ms) |
| P5.1a | Stage 2 pipelined behind Stage 1; parallel per-beat reviews; concurrency budget |
| P5.1b | `exitSnapshotHash` invalidation (only *i+1*; cascade cap 2) |
| P5.2 | 3-way rubric; BLOCKER/ADVISORY; factual citation requirement |
| P5.3 | External judge wiring; blind; no self-review |
| P5.4 | Beat locking/commit; per-beat and per-lesson retry caps |
| P5.5 | Upstream escalation cap = 1; `BOUNDARY_INFEASIBLE` |
| P5.1c | Holistic review targeting; unlocalizable findings advisory or 1A/1B repair |

**Gate G5:** invalidation, lookahead, holistic targeting tests; advisories
reported; judge identity logged.


## 4.5 Model-surface plan — QWEEPS Line DSL (deferred P6/P7)

The remaining AI-side failures are architectural: a 1-D autoregressive model has
no persistent 2-D canvas, no timing register, and no visual feedback loop. Asking
Flash-tier models to solve pedagogy, grounding, layout, choreography and DSL
compilation in one pass is the root cause. The response is to **shrink the
model-facing surface** while keeping the compiled v2 scene unchanged.

P6 (audio/browser_lessons) and P7 (benchmark/rollout) are deferred until this
front-end lands: the DSL changes the authoring path those phases consume.

| ID | task |
|---|---|
| P4.5.1 | Lock the line grammar: `beat`, `retain`, `exit`, `group`, `camera`, `@start`, `@cue`, `show`, `chart`, `link`, `focus`, `move`. |
| P4.5.2 | Tolerant parser with exactly five normalizations: fences, `=`/`:` separators, optional list commas, `@name` → `@cue:name`, case-fold keywords. |
| P4.5.3 | Narration-first cue binding: `[cue:id]` stripped before TTS; `@cue` order must match narration order; `@start` merges at t=0 when the first cue is at t=0. |
| P4.5.4 | Parameterized loops: `loop=<id> passes=n pass_duration=s items=[ids]`; `$item` binds per pass; stateless pulses (`flow`) omit items. |
| P4.5.5 | Stage layout: 9-zone grid + `dock`/`align`; pin-on-place; retained boxes immutable; camera absorbs growth within `min_zoom`. |
| P4.5.6 | Local `plot` space for mathematical proofs; safe Pratt/shunting-yard evaluator (no `eval`), 64 samples; only literals, `x`, `+ - * / ^`, and `{sin,cos,tan,exp,log,sqrt,abs}`. |
| P4.5.7 | Motion/camera primitives: `move`, `flow`, `morph`, `trace`; cross-cue motion rule (clamp to next dependent cue; `SYNC_VIOLATION` below 0.25 s). |
| P4.5.8 | `exit` space reclamation: exit frees the zone but records `prev_box`; re-entry reclaims if free, else `REENTER_NEEDS_DOCK`. |
| P4.5.9 | Groups and z-order: `group ... contains=[...]`; `above`/`below` are spatial, `z` is stacking (`back|base|front|overlay`). |
| P4.5.10 | Readability budget: silent camera 1.0→0.8, gutter 32→16 px, wrap 1→2 lines; hard `CAPACITY_EXCEEDED` below those. |
| P4.5.11 | Argument-aware state card: previous claim, bridge, target claim, open question, active/registry, fixed narration with cues. |
| P4.5.12 | One-beat DSL smoke on Muse Spark 1.3 Contributor and DeepSeek V4.1 Flash before building the solver. **Done: 7/7 ×5 for both.** |

**Grammar rules locked for the smoke**

1. Parameterized loops with `items`/`$item`; no replaying the first item.
2. Safe math only; no `eval`, unknown tokens fail validation.
3. `above`/`below` = Y docking; `z` = stacking.
4. One `chart` primitive for bars/line/scatter/heatmap.
5. `@cue` blocks follow narration cue order; cross-cue motion clamps or violates.
6. Descriptions live in the planner registry, not the director’s lines; optional `note=`.
7. `exit` frees the zone; re-entry reclaims `prev_box` or requires `dock=`.
8. The five parser normalizations are exactly: fences, separators, list commas,
   `@name` alias, keyword case.

**Smoke result (5 attempts each, 2026-10-31)**

| model | latency median | criteria pass | normalizations |
|---|---|---|---|
| Muse Spark 1.3 Contributor | 22.5 s (18.1–23.2) | 7/7 ×5 | `list_commas` in 3/5 |
| DeepSeek V4.1 Flash | 8.0 s (6.1–19.0) | 7/7 ×5 | none |

Both emitted clean DSL with the correct cue order, `proj_arrow` link, and
`sampled_mat` under `@cue:sample_draw`; no prose, coordinates, colours or role
declarations. Raw outputs and the scorer are in `bench/dsl-smoke/`.

**Smoke pass criteria**

1. No prose outside the DSL block (or one fence strip).
2. `@cue` order matches narration.
3. `proj_arrow` links `context_vec → dist_chart`.
4. `sampled_mat` appears under `@cue:sample_draw`, never earlier.
5. ≤5 tolerant-parser normalizations are needed.
6. Every cue appears in the narration in increasing order.
7. No raw coordinates, hex colours, or role declarations.

### Phase 6 — Audio clocks and browser_lessons (7 ED; **deferred until P4.5 lands**)

| ID | task |
|---|---|
| P6.1 | Decide `/ask` clock (measured per-beat TTS vs synthetic) and label `ESTIMATED_CLOCK` if synthetic |
| P6.2 | `browser_lessons`: wire `compile_speech` + `assemble_lesson` clock into `compileBeat` |
| P6.3 | Overlap holds, hold ceiling, explicit clear op |
| P6.4 | `allowOverlap` in renderer health |
| P6.5 | `navigation.ts` current chapter = latest `visualStart` |
| P6.6 | Alignment tiers integrated with existing coverage gate |

**Gate G6:** browser lesson replay parity; hold XOR retain.

### Phase 7 — Benchmark, compatibility, rollout (5 ED; **deferred until P4.5/P6 land**)

| ID | task |
|---|---|
| P7.1 | Matrix: hard prompt + proven sourced topic × DeepSeek/Muse Spark 1.3 Contributor/Gemini × N |
| P7.2 | Sequential runs; external judge; telemetry |
| P7.3 | Analysis: approval, blockers/advisories, wall/calls/tokens, stage timings |
| P7.4 | v2/v3/saved-lesson/Manim compatibility |
| P7.5 | Docs, runbook, limitations |

**Gate G7:** benchmark report; model-viability decision.

## 2. Critical path and timeline

P0 → P1 → P2 → P3 → P4 → P4.5 → P5 → P6 → P7.

Total ~51 ED. With two engineers, roughly 5–6 weeks to G5; Phase 6 in parallel.
First meaningful `/ask` benchmark at G4/G5 (~33 ED).

## 3. Interfaces to freeze

- `AuthoringBeat`, `stateContract`, `BoundarySnapshot`.
- `compileBeat(...) → { compiled, nextSnapshot, provenance }`.
- `ProvenanceRecord(compiledId, errorClass)`.
- Telemetry row (P0.3).
- Health `allowOverlap`.

## 4. Test strategy

- Unit: validators, palette, bars, links, timing DAG, loops, derivedFrom floors,
  containment, hash.
- Golden: authoring → compiled scenes, text layout, compiled SVG, selector
  safety.
- Property: no effect before cause; one hue per role; hold XOR retain; no
  `__gen__` collision; lookahead ≤ 1; unresolved anchors rejected.
- Integration (mocked model): full `/ask`; beat failure isolation; judge tiers;
  invalidation cascade.
- Real smoke: single-beat director, then one full lesson.
- Benchmark: matrix, sequential, external judge, telemetry.

## 5. Risk register

| risk | mitigation |
|---|---|
| Flash semantic capability | external judge, advisory tiers, proven-topic track, hard stop |
| Phase 1 synthetic clock invalidates timing findings | measured clock or `ESTIMATED_CLOCK` labeling |
| Text metric fidelity | cached real measurements, pinned font, golden frames |
| Planner bottleneck | 1A/1B split, contract linter, dedup, planner retry budget |
| DSL misuse | few primitives, defaults, deterministic gates, smoke test |
| Review cost | pipelined Stage 2, concurrency budget, deterministic Stage 1 first |
| Judge bias | non-contender, blind, optional two-judge intersection |
| Backward compatibility | v2 path, v3 envelope, Manim tests |
| Scope creep | phase gates; no Phase 6 before G3 |

## 6. Sanity check

### Traceability

| failure class | plan items | test | solved |
|---|---|---|---|
| A contract/omission | P1.2–P1.4, P2.2/2.3 | corpus replay | yes, mechanically |
| B long-prompt cliff | P4.3, P2.8 | per-beat ≤20k | yes, structurally |
| C spatial/encoding | P2.1–P2.6, P3.4–P3.6 | golden | yes, by construction |
| D sequence/scaffolding | P2.5, P2.7, P4.2b, P5.1b | property/contract | partly: declared errors only |
| E harness defects | P1.1–P1.6 | corpus | yes |
| time | P4.3, P4.5a, P5.1a, P1.4 | stage timings | likely 6–8 min at concurrency ≥2 |
| all-or-nothing gate | P5.2–P5.4 | tier tests | yes |
| self-review | P5.3 | judge telemetry | yes |

### Not sufficient

1. Semantic teaching judgement remains model-bound. The compiler removes
   *declared* errors; it does not choose the right cue, whole, or mechanism.
2. If Flash models still fail on semantic blockers after G5, that is a model
   finding. Hard stop after N runs; switch to the proven-topic track.
3. Phase 1 timing findings are estimates unless P6.1 adds a measured clock.
4. Unsourced factual claims are advisory; quality claims need sources.
5. The p50 target depends on judge concurrency; report both tiers.

## 7. Verdict

The plan is the correct solution for the failure classes under harness control:
contract, long-prompt isolation, spatial encoding, revision economics, and
self-review. It does not guarantee that Flash models pass the hard prompt's
semantic bar.

Acceptance therefore runs on two tracks: mechanical (hard prompt) and quality
(proven topic + source). If the hard prompt fails only on semantic blockers
after G5, the plan has done its job: it made the model limitation measurable and
cheap to reach.

## 8. Implementation status (in progress)

Tests: `263 passed` at the time of writing.

| item | status |
|---|---|
| P0.1 freeze docs | done |
| P0.2 failure corpus | done (`tests/fixtures/failures`, manifest + tests) |
| P0.3 telemetry | partial: per-call `route/model/seconds/chars/tokenizer_est`; lesson rows via `assistant.telemetry.call_record` |
| P0.4 judge harness | done as a module (`assistant.visual.judge`, blind scene, tiers); frames pending |
| P0.5 driver | done (`bench/run_lesson.py`, `bench/README.md`) |
| P0.6 Gemini baseline | not started |
| P0.7 schema smoke | **passed** 2/2 DeepSeek (~85–92 s), 2/2 MiMo (~55–297 s), **2/2 Muse Spark 1.3 Contributor (~11 s)** with `bars` (2 attempts each; plan asked 5) |
| P1.1–P1.8 | landed (completion, validators, JSON recovery, field repair, ID namespace, SVG whitelist, lean skill, MCP off, telemetry) |
| P2.1 roleTable/palette/focusState | done |
| P2.2 bars / P2.3 links / P2.4 svgRef | done |
| P2.5 derivedFrom / P2.6 parentId | done (reading/frustum/containment gates) |
| P2.7 timing grammar/DAG/loops | done as `assistant.visual.timing` + tests; wired into `compile_lesson` |
| P2.8 omission rules | done in `timing.resolve` (effect roles need causal anchors) |
| P3.1 compile_lesson | done (`assistant.visual.v3`) |
| P3.2 ID namespace/provenance | done (`b{beat}__gen__{parent}__{slot}`) |
| P3.3 trusted compiled SVG | done (`trusted_svg.validate_compiled_svg`) |
| P3.4 text metrics | deterministic `text_layout` (wrap/shrink, `lines`/`fontSize`); renderer `fit:none` wiring pending |
| P3.5 camera / P3.6 overlap | analytic helpers done (`geometry.py`), not yet wired into the live gate |
| P3.7 v3 envelope/hash | done (`v3.build_envelope`, canonical JSON) |
| P3.8 v2 compatibility | existing suites pass; saved-lesson integration pending |
| P4.1/P4.2/P4.3 | MVP behind `QWEEPS_V3=1` (`v3_pipeline.teach_v3`): planner + contract + per-beat director |
| P4.4/P4.5 retention | boundary snapshot + retain-id check + deterministic re-injection/placeholder repair; overlap policy in the gate |
| P5.1 deterministic gate | done (`gate.check_scene`: overflow, occlusion, missing evidence); wired into both `teach_v3` paths; `screen_box` scale fixed (was 2x, causing false occlusion blocks) |
| P5.2–P5.3 | rubric/judge tiering present in `judge`; external judge wired into both paths |
| P5.4 | DSL path: judge blockers are mapped to beats; only flagged beats are re-authored with findings, the scene is recompiled and rejudged once |
| P5.5 | escalation cap / `BOUNDARY_INFEASIBLE` pending |
| P4.5 line DSL | parser + five normalizations + dock layout + `AuthoringBeat` lowering implemented (`line_dsl.py`); compiles the real Muse/DeepSeek smoke outputs. DSL-director integration, targeted revision, retention repair, effect anchors, sibling stacking, source-anchored weight labels, `sign` arrows, global text layout, line charts (including negatives), `plot ... at=<key>` data-point placement (numeric keys and `axis=value` forms), one-anchor direction glyphs, guide lines (axes/rules via `direction=horizontal|vertical`), container panels, deferred link resolution, DSL `retain`/`exit` authoritative over stale contract lists, and checkpoint/resume landed; loops and remaining capacity handling pending. |
| P6 audio clocks | deferred until P4.5 lands |
| P7 benchmark | not started |

### Smoke findings

- P0.7: DeepSeek and MiMo both emitted a valid one-beat AuthoringBeat with
  `bars` (2/2 each, 2 attempts).
- First real v3 lesson smoke reached planner → contract → director, then failed
  on `with:cue_neuron_parts_study_input`: the model used an underscore instead
  of the canonical `cue.` separator, and Phase 1 had no cue times. Fixed by
  accepting `cue[._]` and generating synthetic cue times per beat
  (`_synthetic_cues`).
- Second smoke exposed an effect element with an absolute start. The contract
  already declares the cue, so `_enforce_effect_anchors` restores the anchor
  deterministically instead of failing the beat.
- Added compiler-assigned containment: a label fully inside exactly one shape
  becomes that shape's child, so intentional labels are not reported as
  occlusions.
- Cue grammar now accepts model variants: `cue[._]`, hyphenated cue ids,
  whitespace around offsets, `at:` as a `with:` alias, `element.` as an `el.`
  alias, and bare `with:<name>` anchors (resolved as a cue or element start).
  Bare names that are neither are synthesized as cue times in Phase 1.
- Element cap raised 16 → 40 after a real model produced 17; >12 now emits a
  CLUTTER advisory rather than a blocker.
- Per-beat compile retry: a beat that fails `validate_plan` is re-requested once
  with the exact compile error in the request, instead of aborting the lesson.
- Finite out-of-range geometry is clamped into the legal box; non-finite values
  and semantically invalid opacity/durations are still rejected.
- `TimingError` is a `PlanError`, so timing failures use the per-beat compile
  retry. Loop macros anchored to an element fall back to the cue floor (0.4 s)
  under the Phase 1 synthetic clock.
- `derivedFrom` exposure is scheduled, not rejected: the child is shifted until
  the parent has been readable for the required time; the beat extends if needed.
- A `derivedFrom` claim whose parent is an edge or is outside the current camera
  is dropped (the element remains), instead of failing the lesson.
- Undeclared semantic roles are added to the lesson role table with a free
  palette slot; if the palette is full the role is dropped and the raw element
  remains.
- A connector (`arrow`/`line`) with no endpoints is dropped, not fatal.
- A `path` with fewer than two usable points is dropped; flat point lists are
  paired; out-of-range path coordinates are still rejected.
- Non-positive/non-finite draw durations are repaired to 0.5 s during lowering
  (validate_plan keeps its strict contract).
- `compile_lesson` uses `strict_edges=False`: a connector with a missing or
  identical endpoint is dropped in the v3 path; direct `validate_plan` callers
  stay strict.
- A lesson-scoped element registry recovers retained IDs that were dropped in an
  intermediate beat, not just those present in the immediate boundary snapshot.
- Negative or non-finite bar values are clamped to 0; chart scale stays 0–1.
- `compile_lesson` clamps a child inside its parent (containment repair); direct
  `validate_plan` callers still reject overflow.
- Dotted sub-path anchors (`with:inputs.row`) resolve their head under the
  synthetic clock.
- Boundary snapshots carry connector endpoints, so retained arrows are injected
  with valid `from`/`to` instead of being dropped as degenerate.
- Failing beats are captured to `/tmp/opencode/qweeps-capture` and replayed
  locally with `bench/replay.py`; a 200-case compiler fuzz suite runs in <0.1 s.
- Contract `enter` elements omitted by the director trigger a retry; on the
  second attempt they are placeholdered from the contract registry, so later
  `retain`s survive.
- SVG validation names the unsupported element; final compile failures are
  captured for replay.
- `compile_lesson` deduplicates element IDs before timing resolution, keeping the
  first occurrence; direct `validate_plan` remains strict.
- Capture now covers the enter-fallback compile too, and a capture→replay
  roundtrip test guards the harness.
- Beat-level checkpoint/resume: after each compiled beat the lesson state
  (storyboard, contract, role table, compiled beats, registry, boundary) is
  written to `bench/checkpoints/<label>.json`. A rerun resumes at the failing
  beat without repeating the planner, contract or approved beats.
- Malformed timing fields (e.g. a palette slot in `revealAt`) are repaired:
  non-effect elements default to 0.0, effect roles to the first cue. Numeric
  strings are coerced for geometry, camera and durations.
- Missing retained elements are injected from the boundary snapshot with their
  previous geometry and role, then checked for movement.
- The v3 smoke loop was reset to replay/fuzz after repeated continuity findings; tests are at 315. Muse Spark 1.3 reached the derived-exposure gate in 225 s, which is now auto-scheduled. MiMo was replaced by `opencode-go/muse-spark-1.3-contributor` for the contender matrix (community/contributor line).

Known gaps at this checkpoint: no measured `/ask` clock, the renderer does not
consume `lines`/`fontSize` yet, no frame capture for the external judge, and the
v3 loop is opt-in and unbenchmarked.

