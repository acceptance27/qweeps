# Inspect Preview Function Archetypes — Architecture & Reference Guide

## 1. Overview & Purpose

In the 3-level architecture walkthrough system:
- **Level 0 (Macro Blueprint)**: Shows the 2-band Ptolemy/ELK compound container pipeline.
- **Level 1 (Function Scope)**: Shows each inner `@function` step card (`@Inputs`, `Goal`, `Inspect Preview`, and `@Output`) along with unpacked `@static` data cards.
- **Level 2 (Atomic Flowchart)**: Shows the multi-block visual transformation flowchart for a single `@function`.

The **Inspect Preview** sits directly below the **Goal** section (and above `@Output`) inside every Level-1 function card. Its purpose is to give the viewer an immediate, self-explanatory visual mental model of **how** the function transforms its inputs into its output without requiring raw, context-free strings—and to act as an interactive portal (`Inspect ↘`) into the full Level-2 flowchart.

---

## 2. Reactive Display Lifecycle (`waiting` ➔ `in-flight` ➔ `updating` ➔ `ready`)

When **Reactive Display** is enabled (`reactiveDisplay = true` by default):
1. **`waiting` (`reactiveProgress = 0`)**:
   - The function's beat has not started yet.
   - `@Inputs`, `Inspect Preview`, and `@Output` show `none` / awaiting state (`0%` bars, placeholder slots) instead of prematurely displaying the final result.
2. **`in-flight` (`reactiveProgress = 0`)**:
   - The function's beat is active, and the incoming data packet is currently traveling along the incoming flow wire (`pkt.start <= stepLocalTime < pkt.end`).
   - **Rule**: The function MUST NOT update its data the instant the beat becomes active. It waits until the wire packet physically reaches the input port (`stepLocalTime >= pkt.end`).
3. **`updating` (`0 < reactiveProgress < 1`)**:
   - Triggered the moment the incoming packet enters the input port (`stepLocalTime >= pkt.end`).
   - Runs a staged data update animation over ~1.4 seconds:
     - **Stage A (`inputRevealProgress`: `0.00 ➔ 0.35`)**: `@Inputs` lock in as their wire packets arrive.
     - **Stage B (`inspectRevealProgress`: `0.15 ➔ 0.75`)**: The `Inspect Preview` animates its archetype visual (progress bars fill from `0%` to target `%`, vector bars scale out, lookup/gate/verifier rows cascade in sequentially).
     - **Stage C (`outputRevealProgress`: `0.60 ➔ 1.00`)**: `@Output` reveals the computed return value.
4. **`ready` (`reactiveProgress = 1`)**:
   - The transformation is complete and remains settled for all subsequent beats.

---

## 3. The 12 Inspect Preview Function Archetypes (+ Flowchart Fallback)

All archetypes are implemented in `/src/components/InspectPreviewArchetypes.tsx` and automatically resolved from any Level-2 `SubFunctionLesson` via `resolveInspectPreviewArchetype(l2Lesson)`.

| # | Archetype ID | Target Function Pattern | Visual Anatomy in Inspect Preview | Reactive Update Animation |
|---|--------------|-------------------------|-----------------------------------|---------------------------|
| 1 | `split-tokens` | `@parse_intent()`, `@tokenize()` | Sliced word token chips (`[word_1] [word_2]`) + cleanup gate rows (`lowercase` & `✕ drop "?"`) | Token chips pop in left-to-right, followed by cleanup gate rules |
| 2 | `vector-pool` | `@load_guidance()`, `@encode_pool()` | Token ID feature rows (`ID ──▸ vector`) feeding a `Mean-Pool ÷4` strip of signed float badges | Lookup rows appear first, then pooled float badges interpolate from `0.00` |
| 3 | `norm-scale` | `@normalize_beats()`, `@l2_normalize()` | Before (`\|\|v\|\|=2.0`) ──▸ `÷2` ──▸ After (`\|\|v\|\|=1.0`) dual horizontal vector bars | Before bars appear, then `÷2` scales after-bars to unit length `1.0` |
| 4 | `dot-product` | `@score_files()`, `@score_dot()` | 3 parallel candidate score meters (`Candidate A`, `B`, `C`) with horizontal progress bars | All 3 candidate alignment bars animate simultaneously from `0%` to target score |
| 5 | `podium-rank` | `@rank_modules()`, `@rank_sort()` | Ordered leaderboard rows (`🥇 Rank #1`, `🥈 Rank #2`, `🥉 Rank #3`) with score bars | Podium ranks cascade in from `#1` down to `#3` with animated score bars |
| 6 | `gate-keep-drop` | `@top_k_slice()`, `@top_k_select()` | Cutoff gate rows showing `✓ KEEP #1`, `✓ KEEP #2`, and `✕ DROP #3` (excluded branch) | Keep/Drop gate rows cascade in and highlight the dropped branch badge |
| 7 | `tag-stamp` | `@TagSourceSpans()`, `@tag_sources()` | Provenance stamper rows (`[span-1] ──▸ "[file:line] fn()"`) | Stamped badge chips lock onto each raw item from left to right |
| 8 | `doc-scroll` | `@JoinGraphEdges()`, `@join_chunks()` | Stacked document/band blocks separated by a highlighted join separator bar | Top chunk, separator bar, and bottom chunk stack sequentially |
| 9 | `guardrail-shield` | `@GroundingRules()`, `@system_rules()` | Guardrail checklist rows (`✓ ALLOWED`, `✕ FORBIDDEN`, `✓ REQUIRED`) | Policy rules verify one by one with colored status badges |
| 10 | `blueprint-slots` | `@LessonAssembler()`, `@prompt_template()` | 3 structured template slots (`SLOT 1`, `SLOT 2`, `SLOT 3`) locking inputs into a bundle | Each template slot locks in its bound variable sequentially |
| 11 | `heatmap-spotlight` | `@attend_frames()`, `@self_attend()` | Attention relevance focus bars (`94% FOCUS` primary span vs `6% FOCUS` background) | Focus weight bars sweep from `0%` to `94%` / `6%` |
| 12 | `citation-verifier` | `@verify_and_narrate()`, `@cite_decode()` | Grounded verification rows (`CLAIM CHECK ✓`, `CITATION CHECK ✓`, `NO HALLUCINATION ✓`) | Verification checks tick from pending to `✓` verified |
| 13 | `flowchart-fallback` | Any custom / multi-stage function without a specialized table | Multi-column 2D miniature flowchart showing each block's badge, label, and role summary | Flowchart blocks light up in topological column order (`Col 0 ──▸ Col 1 ──▸ Col 2`) |

---

## 4. Layout & Anti-Truncation Rules

1. **Left-Aligned Flow (`flex-1 min-w-0 text-left`)**:
   - Never push `rightValue` to the far right with `justify-between` + narrow `max-w-[95px]`.
   - Always render `[Left Chip] ──▸ [Right Value (flex-1 min-w-0 text-left truncate)]` so the explanation uses the full remaining card width without clipping on the right.
2. **2D Topological Flowchart Strip**:
   - Group Level-2 nodes by topological depth (`col 0 ──▸ col 1 ──▸ col 2`) so parallel inputs (`IN 1 / IN 2`), 3-way fan-outs (`Cand A / B / C`), and dropped branches (`✕ Drop`) stack vertically in their column instead of overflowing horizontally.
3. **Node Kind Independence**:
   - Archetype resolution must inspect `node.customVisual.variant` across **all** `GraphNode['kind']` values (`'transform'`, `'search'`, `'assembly'`, `'generation'`, `'store'`, `'output'`), never filtering by `kind === 'transform'` alone.
