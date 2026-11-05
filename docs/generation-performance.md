# Lesson generation: browser animations and native Manim

Investigation: 2026-11-05. This describes the current home-screen lesson generator,
not the retired experimental chapter-stream viewer or the separate v3 benchmarks.

**Follow-up harness update, 6 November:** the native path now uses a dedicated
lesson prompt, generates only selected native beats, defaults to medium code
reasoning with high reasoning for bounded repair, and requires source/narrative
plus actual-frame review. Native speech is measured before its final frame review.
The measurements below describe the older run, not a post-fix benchmark. See the
[native harness investigation](native-harness-review-2026-11-05.md) and
[current technical report](technical-report.md) for the resulting implementation.

## What the checkbox changes

Browser-only generation already builds a storyboard. It then directs SVG artwork,
descriptions and motion, checks facts and narrative continuity, and inspects actual
browser frames. Rejected sections can trigger more model requests. Configured speech
synthesis also adds preparation work. Browser animations are the default; leaving
Manim unchecked does not remove animation.

Native generation shares the storyboard step, but takes the hybrid path. In per-beat
mode it first directs browser layouts for all beats. It then requests a complete Python
scene with high reasoning and an output ceiling of 40,000 tokens (a ceiling, not a
measurement of usage), compiles and audits that scene, may request one full-file repair,
and fits narration to its scene windows. Configured speech synthesis follows.

The generated SVG layouts for native beats also establish semantic object IDs and the
shared visual contract used by the native scene. Some browser artwork is replaced at
playback, but removing that direction wholesale would also remove those bindings.
This investigation preserves that contract and the accepted scenes.

Both paths use model requests and therefore consume provider quota or billed usage
according to the configured provider. SVG playback itself runs locally in the browser;
native compilation and playback use the desktop Python/graphics runtime. There is no
additional model request per displayed animation frame. Speech is a separate service.

## What the evidence establishes

Existing OpenCode call logs record request duration, input/output character counts,
image counts, and estimated tokens. They do not reliably associate every historical
call with a lesson and pipeline phase. Saved lesson file modification times also mix
retries, imports and subsequent edits. No matched same-topic, same-model, same-source
Manim-on versus Manim-off benchmark was available, so an exact seven-minute penalty
cannot be established from these records. Longer code generation, compilation,
repairs, rate limits, and the browser review cycle can each add time.

No live provider benchmark was run in the initial investigation described here.
The follow-up includes small bounded provider and synchronization probes, not a
fresh 20-beat first-generation speedup measurement.

## Changes

- Requests for native Manim fail before planning when the native runtime is absent;
  Android is explicitly unsupported for native rendering. The UI disables that option
  when unavailable and labels it as slower when available.
- Successfully compiled and audited native source is checkpointed by the complete
  prompt, model and provider. A retry with the same inputs reuses the code, then
  recompiles and audits it with the current runtime. Changed inputs or an explicit
  regeneration request generate fresh code. Failed scenes are not checkpointed.
- `generation-timings.json` in each new lesson's preparation folder records completed
  phase wall times for storyboard, artwork direction, factual and narrative review,
  native scene preparation, narration fitting, and native-path speech as applicable.
  The job API also returns these `timings` values.
- `native-generation-timings.json` separates code generation, compilation/audit, and
  code repair, and records whether a source checkpoint was available. Failures retain
  the timings collected before they stopped.

Timings are seconds, not prices or lesson playback durations. Parallel model requests
inside a phase overlap; summing provider-call durations is not wall-clock duration.
Reused checkpoints may omit phases entirely. Browser frame capture/waiting and its final
vision review are not currently included in these phase receipts. These receipts are
local diagnostics and contain no source text, prompts, API keys, or credentials.

The removed **Fast chapter stream** entry was an experimental parallel chapter preview
and gate viewer. Its page and library button are removed; old `?stream=1` links return
to the home screen. Internal streaming APIs remain for existing programmatic consumers.

## 20-beat matched run, 2026-11-05

A same-topic, same-provider 20-beat pair was generated to expose the cost of
the native path at the new 20-beat ceiling. Both runs targeted *How transformer
language models learn* with the same `opencode-go/muse-spark-1.3-contributor`
model:

| Run | Beats | Native beats | Lesson duration | Generation wall time |
|---|---:|---:|---:|---:|
| Browser-only SVG/GSAP | 20 | 0 | 722.6 s | 199.0 s |
| Native hybrid ManimGL | 20 | 7 | 175.9 s | 590.3 s |

The native run was 391.3 s slower (2.97x). Its unique native-scene phase cost
211.1 s, split into 193.7 s of code generation and 17.4 s of compile/audit.
Artwork/storyboard variance also contributed (81.8 s storyboard and 283.9 s
artwork versus 14.5 s and 112.4 s in the browser-only run).

The browser-only lesson was approved at ~199 s. Its long-script Fish speech
attempt initially failed because the local aligner received the entire lesson
script as an initial prompt; Whisper skipped the opening words of the 9-minute
recording. Removing that prompt and reusing the measured word timestamps made
synchronization succeed in a separate ~110 s pass, so the browser-only lesson
now has continuous narration. The native run was generated with TTS disabled
and currently plays with captions. The raw timings are in
`bench/runs/20beat-transformers-final-2026-11-05/`. This is one pair, not a
stable speed estimate: it records substantial run-to-run model and review
variance at 20 beats.
