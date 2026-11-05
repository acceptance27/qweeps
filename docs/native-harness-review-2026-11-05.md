# Native lesson harness investigation — 2026-11-05

Failure case: `c292a6f916197a9e83768f53e3bcbd75`, **How Transformer Language Models Learn**.
The saved lesson and generated Python were reviewed as evidence, without hand-editing
that output. Changes target the generation, review and narration synchronization harness.

## Findings from the actual lesson

The registered native scene contains 20 beats and runs 47.8 seconds. The continuous
hybrid player uses seven native beats (`embed` through `multihead`), totaling about
15.9 seconds, and 13 browser-layout chapters. Each displayed native beat is only
2.0–2.4 seconds. All seven have **zero semantic runtime cues**. The other 13 native
beats were generated but never used in the hybrid player.

The model received two conflicting short-video instructions: 30–50 seconds in the
system prompt and roughly 30–55 seconds for the whole native lesson in the user
prompt. It was expected to fit 20 different learning questions into that budget.
The pipeline then wrote `approved: true` after compilation/mechanical auditing,
without a factual/narrative and actual-frame teaching gate equivalent to the browser
path. Compilation was being treated as teaching approval.

Actual native frames were captured at early, middle and finished positions for all
seven displayed native beats, with requested renderer revisions and source hashes.
The review found:

- Embeddings shown as three scalar bars rather than a labelled vector-space construction;
  the running token example also changes an ID between the browser intro and native scene.
- Positional information shown as boxes and a plus sign without identifiable components
  establishing the addition.
- Q/K/V shown as arrows to labelled boxes, without the learned projections promised
  by the lesson or a worked compatibility calculation.
- Attention scores shown as an unexplained grid, without meaningful row/column identity.
- Softmax shown as changing bar lengths and a claim that weights sum to one, without
  the numeric transformation needed to check the claim.
- Value mixing represented by thicker connector lines, without component values or a
  visible weighted vector sum.
- Head labels such as grammar/position/topic presented without explaining that these
  are illustrative patterns, not guaranteed fixed roles.

These are teaching defects, not a request for a different font. The relevant reference
relationship is the weighted sum of value vectors and learned attention projections
in [Attention Is All You Need, §3.2](https://arxiv.org/html/1706.03762v7#S3.SS2).

## Bottleneck evidence

| Phase | Wall seconds | Share of completed measured phase work |
|---|---:|---:|
| Storyboard | 81.831 | 13.9% |
| Layout/artwork direction | 283.884 | 48.3% |
| Native scene preparation | 211.116 | 35.9% |
| Narration fitting | 10.602 | 1.8% |

Native preparation includes 193.686 seconds of model code generation and 17.396
seconds of compilation/auditing. Phase receipts sum to 587.433 seconds; recorded
job wall time is 590.251 seconds, including polling/other overhead. This run had no TTS.

The provider was **not fully serialized**. The call log shows overlapping requests
in approximately four-worker waves. Timestamps have one-second precision, so exact
peak overlap cannot be recovered from that log. The layout stage made 17 model calls
for 12 directed groups and saved 15 validator attempts: retries and slow requests
matter. Typical layout requests contained about 44,000 input characters. Each repeated
the entire 20-beat progression including other beats' full presentation rationales.

The 40,000-token setting is an output ceiling, not evidence of 40,000 tokens being
used. Historical logs omitted actual provider usage/reasoning/cache statistics, so
precise historical quota cost cannot be reconstructed from character counts.

## Current Go prices and a bounded task comparison

Official sources checked on 2026-11-05:
[OpenCode Go](https://opencode.ai/v2/docs/console/go/),
[Meta model guide](https://dev.meta.ai/docs/models).

Per million input/output tokens, excluding cached input:

| Model | Input | Output |
|---|---:|---:|
| Muse Spark 1.3 Contributor | $0.10 | $0.20 |
| MiMo V2.6 Flash | $0.14 | $0.28 |
| GLM-5.3 Flash | $0.15 | $0.50 |
| Qwen3.8 Flash | $0.15 | $0.47 |
| DeepSeek V4.1 Flash, off-peak / peak | $0.15 / $0.30 | $0.60 / $1.20 |

Muse is among the cheapest paid options, tied with 1.2 Contributor. Limited-time free
models also exist. Contributor pricing has a training-data tradeoff. Meta's maximum
reasoning configuration is unavailable for Contributor, so benchmark headlines for
Muse at max effort cannot establish this endpoint's capabilities.

A real, identical two-beat code-generation task was sent twice to each of five models,
with low reasoning, a requested 4,096-token cap, temperature 0.2, three concurrent
requests at most, no fallback and no automatic retries. This is a small integration
probe, not a universal model ranking or a 20-beat end-to-end benchmark.

| Model | Request seconds, two trials | Result |
|---|---|---|
| Muse 1.3 Contributor | 27.5 / 32.6 | Complete code both times; valid CE options initially rejected by our adapter. Both compile and pass mechanical audits after adapter fixes, with the generated files unchanged. |
| GLM-5.3 Flash | 23.5 / 26.8 | Faster text responses, but both files call `wait` with conflicting positional/keyword durations. |
| Qwen3.8 Flash | 50.0 / 38.7 | Both files use invalid two-component points for `move_to`. |
| DeepSeek V4.1 Flash | 48.5 / 25.4 | Both exhaust the requested cap on reasoning and return no final code; not a capability verdict with a larger budget. |
| MiMo V2.6 Flash | 100.5 / 100.4 | Both hit the request timeout. |

The original Muse responses used valid CE `tip_length` and axis tip dimensions that
QWEEPS' native adapter rejected. A real CE probe accepted those options. They were
fixed in the adapter, then the exact original model outputs were compiled and rendered
again. Mechanical success remains separate from teaching quality: one comparison
candidate still had misleading score-bar heights and intermediate label overlaps.
No model has earned a universal "fastest, cheapest, most capable" label from this test.
No account/model/privacy settings were changed.

## Harness changes

- A dedicated lesson code-generation prompt follows per-beat reading/teaching budgets,
  with no short-video-wide runtime quota. Cue/context setup is explicit. The published
  native timeline retains the full construction before its first semantic cue.
- Only the native beat subset is written as Python; the full lesson sequence and
  non-native chapters remain. The target beat keeps its full presentation contract.
  The global progression summary omits repeated presentation rationales, reducing that
  field in this failure case from 12,901 to 6,611 characters per direction request.
  This is a measured payload reduction, not a claimed end-to-end speedup.
- Native code generation has its own reasoning budget (medium by default, overridable
  with `QWEEPS_NATIVE_REASONING_EFFORT`), with high reasoning reserved for its bounded
  repair. A same-fixture medium probe took 79.5 seconds of code generation versus
  157.5 seconds for the high probe; both needed validation. The medium-only probe was
  rejected before publication. These are single probes, not a reliable speed forecast.
- Compilation validates exact native cue coverage, action ordering, reading time,
  result hold time and a clear region for the player’s transparent subtitles. A mechanical repair is bounded to one attempt.
- New native jobs require source/narrative checks and actual native plus SVG frames.
  Native frames are captured on the final measured audio clock, with renderer revision
  and source fingerprints. Failed review preserves any previously published lesson.
- Valid CE arrow/axis tip dimensions are supported. Repeated numeric labels in separate
  input cards no longer count as duplicated headings.
- Provider receipts preserve real usage, reasoning/cache information, returned quota
  allowance, requested reasoning/cap and retry responses. QWEEPS identifies its own
  client rather than impersonating the OpenCode CLI.

## Native narration synchronization

New scenes declare and compile semantic setup, operation and result cues. Their
actual runtime events become `nativeCueObjects`, which are sent through the same
exact-phrase/Whisper-word alignment harness as SVG objects. The mapper observes their
phase meanings and ordered spoken phrases. Missing or inverted native anchors stop
publication instead of silently producing a linear fallback. Existing legacy lessons
still load; an old cue-less scene needs regeneration to gain these checks.

The final piecewise map preserves initial holds, the measured spoken bridge and
settled results. Native scenes now use the same visual handoff rule as browser scenes:
the previous completed diagram remains until the incoming reasoning bridge ends.
Playback, pause, arbitrary forward seek and rewind use a shared deterministic map.
Extreme action compression is rejected; one targeted anchor repair may reuse the
original recording and measured words. It never synthesizes another recording just
to correct anchors. Cue-policy changes invalidate stale mapping checkpoints.

A real two-beat harness integration fixture generated native code, synthesized one
Fish recording, ran cached local Whisper alignment, and captured real native frames.
The final recording is 34.031 seconds. The second chapter begins at 15.23 seconds;
its bridge ends at 18.86 seconds, when the native diagram takes over. Its setup,
operation and result align at 19.44, 23.42 and 29.56 seconds. In browser playback,
pause held both clocks at about 15.49 seconds, and forward seek / rewind / return
resolved to the same 26.06-second audio/visual state. This is real integration evidence,
not a claim that the original 20-beat lesson has been regenerated or approved.

The original 20-beat saved lesson was not rewritten. No new full 20-beat production
benchmark or broad frontier-model teaching leaderboard is claimed. Rendered QA is a
gate and evidence collection step, not a guarantee that every generated explanation
will be correct or pedagogically strong.

## Validation summary

- Final full repository check on 6 November: 518 Python tests passed, 2 skipped.
- 194 related Python tests passed, including rejected native publication, cue coverage,
  source subset selection, stale-frame revision checks, measured native phrase mapping,
  bridge holds, bounded anchor repair and subtitle protection.
- 78 frontend tests passed, including stateless native clock interpolation and rewind.
- TypeScript checks and the studio production build passed. The running visual service
  was restarted with the updated harness. The regenerated studio assets are served locally.
- Real native sources, Fish audio and Whisper alignment were exercised on the host.
  Temporary browser review fixtures were removed after playback verification.
- Full 20-beat regeneration was deliberately not used to stand in for the requested
  harness repair; the original saved failure case is preserved as evidence.
