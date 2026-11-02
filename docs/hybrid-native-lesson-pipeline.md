# Hybrid native Manim + layout lesson pipeline

How QWEEPS should turn a question like **“How does a neuron fire?”** into one
lesson that interleaves native ManimGL beats with traditional SVG/GSAP layout
beats. This document separates what already works from the orchestration that is
still manual.

---

## 1. The target output

One lesson, one clock, mixed stages:

| # | Chapter | Stage | Lesson time | Native scene time |
|---|---|---|---|---|
| 1 | A charged battery at rest | native ManimGL | 0.0–5.1 | 2.7–7.8 |
| 2 | Many whispers, one decision point | layout `fanin` | 5.1–11.1 | — |
| 3 | Threshold: fire or stay silent | native ManimGL | 11.1–16.1 | 13.6–18.6 |
| 4 | The flood that is the spike | native ManimGL | 16.1–20.7 | 18.6–23.2 |
| 5 | How high, how fast, how brief | layout `comparison` | 20.7–26.7 | — |
| 6 | The wave that recharges itself | native ManimGL | 26.7–32.6 | 27.8–33.7 |
| 7 | Reset and hand-off | layout `process` | 32.6–40.0 | — |

Properties:

- Every native chapter maps a lesson-time window to a fixed window of the
  ManimCE scene (`nativeOffset`).
- Layout chapters keep the existing generated SVG/GSAP stage.
- Switching stages must not rebuild the native scene; the worker stays alive for
  the lesson session and the first native scene is prewarmed.
- The model authors both halves: the storyboard, the ManimCE source, and the
  layout chapters. No hand-written scene code or layout JSON.

The neuron lesson (`2b7bfbc8f976b6ff69081baefb0d9cb4`) is the reference output.
It was assembled manually; this document describes how to automate it.

---

## 2. What already exists

| Piece | File | State |
|---|---|---|
| Storyboard planner | `src/assistant/visual/browser_lessons.py` (`PLAN`, `DIRECT`, `STREAM_CHAPTER`) | Works for layout beats |
| Layout validation/direction | `validate_lesson`, `_stream_generate` | Works |
| ManimCE code prompt | `src/assistant/visual/manim_code_prompt.py` | Ported from generative-manim |
| ManimCE → native compile | `ce_native.py`, `recorded_scene.py` | Works, incl. `self.beat()` |
| Play-boundary checkpoints | `recorded_scene.py` | Deterministic seek, shape-safe |
| Native worker | `native_live.py` | Fixed scene ids (`wbc`, `blood3d`, `neuron`) |
| Native host/manifests | `native_host.py`, `public/lessons/*_native.json` | Per-scene whitelist |
| Player native mapping | `LiveLessonPlayer.tsx` (`nativeTime`) | Works |
| Worker keep-alive + prewarm | `NativeLessonCanvas.tsx`, `LiveLessonPlayer.tsx` | Works |
| Native scene catalog | `native_catalog.py` | Fixed scenes only |
| Hybrid lesson JSON | `bundled-lessons/browser-lessons/2b7b…/lesson.json` | Hand-authored |

What is **not** automated:

1. The planner does not decide “native vs layout” for a new topic.
2. Nothing generates ManimCE from the storyboard inside the live job.
3. `ce_native` is never called by the job.
4. Generated scenes cannot be registered without editing `native_live.py` and
   `native_host.py`.
5. Layout chapters for the non-native beats are not directed from the same
   storyboard during assembly.
6. No review gate compares the native beats with the storyboard.

---

## 3. End-to-end flow

```
question + source
        │
        ▼
[1] QWEEPS plan  ───────────────►  storyboard (beats, teaching, continuity)
        │                                  │
        │                                  ├── native-run selection
        │                                  ▼
        │                        [2] ManimCE generation
        │                         manim_code_prompt("high")
        │                         + storyboard beats
        │                                  │
        │                                  ▼
        │                        [3] compile + validate
        │                         ce_native.load_native_scene
        │                         read self.beat() windows
        │                                  │
        │                                  ▼
        │                        [4] native scene registry
        │                         source + manifest + review frames
        │                                  │
        │                                  ▼
        └──────────────► [5] layout direction (non-native beats)
                                   │
                                   ▼
                        [6] assemble lesson
                         interleave, nativeOffset, start/end
                                   │
                                   ▼
                        [7] review + publish
                         frame review, time audit, manifests
                                   │
                                   ▼
                        live player (prewarm + keep-alive)
```

---

## 4. Stage contracts

### 4.1 Request

`POST /api/visual/live/jobs`

```json
{
  "question": "How does a neuron fire?",
  "documentId": null,
  "native": true
}
```

`native: true` opts into hybrid authoring. Without it, keep the current
layout-only behaviour unchanged.

Cache key:

```
sha256(question, sourceDocumentHash, model, promptVersion,
       detailLevel, storyboardHash)
```

Store under `~/.cache/omarchy-assistant/hybrid-lessons/<key>/`:

```
storyboard.json
native/source.py
native/manifest.json
native/review-*.jpg
lesson.json
```

### 4.2 Storyboard

Extend the planner output with a native decision per beat:

```json
{
  "id": "threshold-test",
  "title": "Threshold: fire or stay silent",
  "question": "Why do small nudges fade but a big enough push fires?",
  "insight": "Below about -55 mV charge leaks away; above it the response is all-or-none.",
  "teaching": "comparison",
  "layout": "diagram",
  "presentation": { "...": "..." },
  "continuity": { "from": "summation-decision", "bridge": "The summed voltage is read against one boundary." },
  "visibleOperation": "before/change/after",
  "renderer": "manimgl",
  "nativeRun": "main",
  "nativeBeat": "threshold-test"
}
```

Rules:

- `renderer: "manimgl"` only when a generated scene can actually teach that
  beat. Otherwise the beat stays layout.
- Native beats are grouped into **runs**. A run is a contiguous set of beats
  rendered by one continuous `GenScene`. Layout beats may sit between runs.
- `nativeBeat` must equal the `self.beat(...)` id the ManimCE scene will emit.
- `nativeRun: "main"` is the default; multiple runs are allowed for long
  lessons, but each run is a separate generated scene.

### 4.3 Layout beats

Use the existing `DIRECT`/`STREAM_CHAPTER` path for beats without
`renderer: "manimgl"`. The director receives the full storyboard and must
produce the same chapter shape it produces today. `validate_lesson` continues to
compute their durations.

### 4.4 Native scene manifest

```json
{
  "sceneId": "gen_9b41c2d7",
  "title": "How does a neuron fire?",
  "sceneClass": "GenScene",
  "source": "~/.cache/omarchy-assistant/hybrid-lessons/<key>/native/source.py",
  "duration": 43.4,
  "beats": [
    {"id": "resting-membrane", "title": "A charged battery at rest", "start": 2.7, "end": 7.8},
    {"id": "summation-decision", "title": "Many whispers, one decision point", "start": 7.8, "end": 13.6}
  ]
}
```

The scene id is content-addressed from the compiled source hash. The manifest is
the only thing the runtime needs to load the scene.

### 4.5 Lesson chapter

Native:

```json
{
  "id": "threshold-test",
  "start": 11.1,
  "end": 16.1,
  "renderer": "manimgl",
  "nativeScene": "gen_9b41c2d7",
  "nativeOffset": 13.6,
  "visual": { "...": "still present for captions, roles and inspection" }
}
```

Layout: unchanged.

`nativeOffset` is the scene time at the chapter's first lesson frame:

```
sceneTime = nativeOffset + (lessonTime - chapter.start)
```

The player clamps to the chapter and stops at `chapter.end`, so it never runs
past the beat window.

---

## 5. Native authoring stage

### 5.1 Choosing the run

For each contiguous group of native beats:

- One prompt, one `GenScene`.
- The prompt lists the exact storyboard beats and their insight/visible
  operation, in order.
- Required marker call at each beat:

```python
self.beat("<beat-id>", "<beat title>")
```

`RecordedScene.beat()` already records the clock. No `beat` definition is needed
in the generated file.

### 5.2 Prompt

System prompt: `manim_code_generation_prompt("high")` from
`src/assistant/visual/manim_code_prompt.py`.

User prompt:

```
Create one continuous ManimCE scene that teaches this QWEEPS lesson.
Follow the beat order exactly. At each beat start call self.beat(id, title).
[storyboard beats with question, insight, visibleOperation]
[shared encodings from the plan]
No extra beats. No reordering.
```

Model: the configured visual model (`opencode-go/muse-spark-1.3-contributor`).
Request settings: `max_tokens: 40000`, `reasoning_effort: "high"`.

### 5.3 Compile and extract windows

```python
scene = load_native_scene(source_path)   # ce_native
windows = scene.beats                    # [{"id","title","time"}]
duration = scene.duration
```

Validation:

- every requested beat id appears exactly once;
- beat order matches the storyboard;
- the first beat is not at 0.0 (the lesson header supplies the title);
- duration is within 20–90 s;
- compile raises no exception;
- a sample frame at each beat center renders non-blank.

If compilation fails, feed the exception back to the model for one repair pass,
then fail the job with the last error.

### 5.4 Deterministic cleanups

Applied to generated source before compile/registration, all timing-preserving:

- remove a duplicate scene title before the first beat;
- replace `Transform(caption, other_text)` with a crossfade
  (`FadeOut` + `FadeIn` + reassignment), because ManimGL/ManimCE interpolate
  glyphs differently;
- keep every `self.play` and `run_time` unchanged so beat windows stay valid.

Further layout fixes (label collisions) should be reported by the frame review,
not silently rewritten.

---

## 6. Scene registry and runtime

Replace the hard-coded `if lesson_id == ...` chain with a registry.

### 6.1 Registry layout

```
~/.cache/omarchy-assistant/native-scenes/
  gen_9b41c2d7/
    scene.py
    manifest.json
```

`manifest.json` is the file shown in §4.4.

### 6.2 Loader

`native_live.py`:

```python
scene_id = sys.argv[4]
manifest = load_manifest(scene_id)
scene = load_native_scene(manifest["source"])
scene.lesson_id = scene_id
```

Keep the built-in `wbc`, `blood3d`, and `neuron` entries for compatibility.

`native_host.py`:

- resolve `lessonId` through the registry;
- use `manifest["duration"]` for the playhead limit;
- reject unknown ids.

No code edits are needed when a new generated scene is registered.

### 6.3 Runtime lifecycle

- The player prewarms the first native scene when the lesson opens.
- The native worker stays alive across layout/native switches.
- The worker is closed on lesson close or page unload.
- One worker per scene per session; switching chapters only seeks.

This is already implemented in `LiveLessonPlayer.tsx` and
`NativeLessonCanvas.tsx` for fixed scenes; the registry only changes how the
scene id is resolved.

---

## 7. Assembly algorithm

```python
clock = 0.0
chapters = []
for beat in storyboard.beats:
    if beat.renderer == "manimgl":
        window = native_windows[beat.nativeRun][beat.id]
        duration = window.end - window.start
        chapter = make_native_chapter(beat, duration)
        chapter.nativeOffset = window.start
        chapter.nativeScene = scene_id_for(beat.nativeRun)
    else:
        chapter = layout_chapters[beat.id]   # directed in stage 5
        duration = chapter.end - chapter.start
    chapter.start = round(clock, 2)
    chapter.end = round(clock + duration, 2)
    chapter.finishedAt = round(chapter.end - 2, 2)
    chapters.append(chapter)
    clock += duration
lesson.duration = round(clock, 2)
```

Then:

- rewrite `continuity.from` to the previous chapter id;
- keep `roles` and `visual` on native chapters for captions and inspection;
- ensure no gap/overlap on the clock;
- write `lesson.json` and register the scene manifest.

For the neuron example this produces the table in §1.

---

## 8. Quality gates

### 8.1 Storyboard gate

- teaching method matches layout;
- native beats are a contiguous run and in order;
- every native beat has a distinct insight;
- no native beat exists only to show an object; it must carry the inference.

### 8.2 Native gate

- compile succeeds;
- `self.beat` ids/order match;
- duration and windows present;
- frame review at each beat center:
  - no label touching/overlapping another label or a container border;
  - the beat's `visibleOperation` is observable;
  - no duplicate title or stuck caption;
- performance: build ≤ 8 s, seek ≤ 200 ms, frame ≤ 50 ms.

The neuron prototype failed the label-collision review in the independent scene;
the QWEEPS-planned scene passed after two fixes. The gate must catch these
automatically before publishing.

### 8.3 Layout gate

Existing browser frame review.

### 8.4 Time audit

- `chapter.start/end` cover `[0, lesson.duration]` with no gaps;
- every native chapter's `sceneTime` stays inside its window;
- seeking to every chapter start produces the expected stage (native image vs
  generated SVG).

---

## 9. Failure and retry

| Failure | Action |
|---|---|
| Model returns no code | retry once with `reasoning_effort: high`; then fail |
| Compile error | send the exception to the model, one repair pass |
| Missing/extra beat | regenerate with the explicit id list |
| Frame review failure | targeted repair prompt with the failing beat and defect |
| Layout direction failure | existing retry path |
| Worker crash | host returns the error; player reports, job can be resumed |

Keep the last generated source and frames for diagnosis. Never publish a lesson
whose native manifest is missing or whose beat windows do not match the
storyboard.

---

## 10. Implementation checklist

Ordered, smallest safe increments:

1. **Registry** — add `native_scenes.py` (read/write manifests, resolve ids);
   make `native_live.py` and `native_host.py` registry-first, keep built-ins.
2. **Planner native fields** — finish `renderer`/`nativeRun`/`nativeBeat`
   validation in `browser_lessons`; add a `native: true` request flag.
3. **Native generation stage** — call `manim_code_prompt("high")` from the job,
   compile with `ce_native`, extract `scene.beats`, write the manifest.
4. **Cleanups** — title removal and caption crossfade, timing-preserving.
5. **Layout direction** — direct only non-native beats from the same storyboard.
6. **Assembly** — build the lesson from storyboard order with `nativeOffset`,
   rewrite continuity, audit the clock.
7. **Review gate** — render native beat frames, run the collision/operation
   checks, retry on failure.
8. **Publish** — write the lesson and registry entry; prewarm on open.
9. **Tests** — storyboard with mixed beats; assembly time math; registry load;
   compile a tiny generated scene; no-gap audit.

---

## 11. Worked example: neuron

1. Question: “How does a neuron fire?”
2. QWEEPS planner → 7 beats:
   `resting-membrane`, `summation-decision`, `threshold-test`,
   `upstroke-flood`, `spike-shape`, `propagation-wave`, `reset-release`.
3. Native run: the four mechanism beats
   (`resting-membrane`, `threshold-test`, `upstroke-flood`,
   `propagation-wave`); layout: summation (`fanin`), spike shape
   (`comparison`), reset/hand-off (`process`).
4. One `GenScene` generated from the full storyboard, 43.4 s, with
   `self.beat(...)` at every beat (including the layout beats, so the windows are
   exact).
5. Compiled natively; windows:
   `2.7, 7.8, 13.6, 18.6, 23.2, 27.8, 33.7`.
6. Assembly picks the four native windows and three layout chapters.
7. Lesson clock 40.0 s, no gaps.
8. Player prewarms `gen_…`; switching to a layout beat and back only seeks.

`bundled-lessons/browser-lessons/2b7bfbc8f976b6ff69081baefb0d9cb4/lesson.json`
is the current reference; `src/assistant/visual/scenes/qweeps_neuron_lesson.py`
is the generated ManimCE source.

---

## 12. Implementation status

Implemented on this branch:

- **Registry** — `native_scenes.py` stores `scene.py` + `manifest.json`;
  `native_live.py` and `native_host.py` resolve registry ids and built-ins.
- **Native authoring** — `native_author.py` builds the prompt from the
  storyboard, generates one `GenScene`, compiles it through `ce_native`,
  validates beat ids/order, and registers the manifest.
- **Hybrid job** — `BrowserLessonStore._generate_hybrid` runs plan → layout
  direction → native generation → compile → assembly when `native: true`.
- **Assembly** — storyboard order, native windows, `nativeOffset`, rebuilt clock
  and continuity (`native_author.assemble`).
- **Cleanups** — duplicate scene title hidden; `Text`-to-`Text` transforms
  replaced with opacity crossfades and variable reassignment.
- **Runtime** — registry manifests, worker keep-alive, first-scene prewarm,
  registry experiment handling, generic semantic roles for generated scenes.
- **UI** — “Include native ManimGL beats” in the live lesson loader.

Still to build before this is production-ready:

- **Native review gate** — render a frame per beat and reject label collisions,
  duplicate titles, or a missing promised construction. The prototype pipeline
  publishes after compile validation only.
- **Layout review for native jobs** — the hybrid path skips the existing
  browser-frame review and its revision loop.
- **Multiple native runs** — one scene per contiguous native run; the assembly
  currently supports a single run per job.
- **Narration budget** — cap native-beat narration at roughly
  `window × 3` words, or move the explanation into an adjacent layout beat.
- **Portable generated lessons** — registry scenes live in the user cache;
  publishing a bundled lesson still needs the source copied into `scenes/` or
  the lesson kept in the cache.
- **Layout duration balance** — a leftover layout beat can absorb the rest of
  the storyboard (the 4-beat neuron run left a 32 s final layout beat).

## 13. Measured on the first hybrid run

Question: “Explain how a neuron fires in 4 beats.” (`native: true`)

| Stage | Time |
|---|---|
| plan / storyboard | 34 s |
| layout direction (4 beats) | 5 m 34 s |
| native ManimCE generation | 4 m 12 s |
| compile + beat windows | 5 s |
| assembly + publish | < 1 s |
| **question → first hybrid lesson ready** | **~10 m 24 s** |

The pipeline does not stream individual beats. The first native beat appears
only after the whole job is ready, when the player opens and the scene builds
(another ~5–8 s).

Narration, after synchronization:

| Stage | Result |
|---|---|
| anchor mapping (4 chapters) | 5 s |
| TTS + alignment + one WAV | 70 s |
| output | 85.4 s continuous WAV, 5/6/6/4 cues |
| lesson clock | 50.95 s |

**Pacing mismatch:** the four chapters carry 50–65 words of narration each,
while a native window is 5–7 s. The one-track narration is 85.4 s but the
lesson clock is 51 s. The player advances chapters on the lesson clock, so the
stage changes before the narration finishes. Native-beat narration must be
capped to roughly `window × 3` words, or that explanation must move into the
adjacent layout beat.

The initial sync attempt failed because the anchor step asked for 2,000 tokens
while Muse Spark spent ~2.2k on reasoning and returned empty content. The budget
is now 8,000 and synchronization succeeds.

## 14. Open questions

- **Multiple native runs** — one continuous scene per run, or one scene for the
  whole lesson with layout beats skipping ahead? The current player supports
  windows, so multiple runs are the safer default.
- **Narration length** — a 4–6 s native window cannot carry 90 words. The
  planner should cap native-beat narration at roughly `window × 3` words, or
  move explanation into the adjacent layout beat.
- **Beat windows without markers** — if the model omits `self.beat`, fall back
  to proportional splits only as a last resort; mark the lesson unreviewed.
- **Generated scene reuse** — content-addressed reuse lets a second lesson on
  the same topic skip generation.
- **Dynamic scene ids in bundled lessons** — bundled lessons currently assume
  fixed ids. The registry should accept both.
