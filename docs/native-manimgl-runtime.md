# ManimCE, the compiler, and Native ManimGL

This document explains the three things that are easy to confuse in QWEEPS:

1. **ManimCE** — the authoring API the AI writes and humans review.
2. **The compiler** — a deterministic pass that turns ManimCE source into a
   ManimGL scene without an LLM rewriting it.
3. **Native ManimGL** — a ManimGL scene running inside a Python worker,
   seekable and clickable, streaming frames into the browser.

The short version:

```
LLM / human  ──writes──▶  ManimCE scene (.py)
                                │
                     ce_native.compile_native_source()
                     (import swap, base class, set_width, autoregister)
                                │
                                ▼
                     RecordedScene (manimlib)
                     single forward pass → tracks + baked keyframes + roles
                                │
                                ▼
                     native_live worker (Python, OpenGL)
                     evaluate(t) → 1280×720 JPEG + bounds (state.json)
                                │
                                ▼
                     LiveLessonPlayer → NativeLessonCanvas
                     time is owned by the lesson; clicks → selected ids
```

---

## 1. Vocabulary

| Term | Meaning here |
| --- | --- |
| **ManimCE** | Manim Community Edition (`from manim import *`). The language the AI is good at. |
| **ManimGL** | 3b1b's renderer (`from manimlib import *`). Different API, OpenGL. |
| **Native ManimGL** | ManimGL executed inside `native_live`, one frame per requested state. Not a window, not an mp4. |
| **Baked clip** | ManimGL rendered once to `.mp4`. High fidelity, cannot be clicked. |
| **SVG stage** | `GeneratedStage`: the browser re-draws a plan as SVG. Fast, precise clicking, limited visuals. |
| **Compat shim** | `manimgl_compat.py` (repo root) + aliases in `recorded_scene.py`: CE names mapped onto manimlib. |
| **RecordedScene** | A `Scene` whose `play()`/`wait()` record a timeline instead of rendering it. |

Three different artifacts can show the *same* WBC beat:

- baked film (rich, not clickable),
- native scene (clickable, live, 720p),
- SVG beat (clickable, primitive).

They are not interchangeable; they are three renderers for the same teaching
content.

---

## 2. ManimCE vs ManimGL (only what matters)

| Concern | ManimCE | ManimGL |
| --- | --- | --- |
| Import | `from manim import *` | `from manimlib import *` |
| Create animation | `Create` | `ShowCreation` (CE `Create` aliased in the shim) |
| LaTeX | `MathTex` | `Tex` (alias provided) |
| Scene base | `Scene`, `MovingCameraScene` | `Scene`, `InteractiveScene` |
| Camera frame | `self.camera.frame` | `self.camera.frame` / `self.frame` |
| Frame width | `frame.set(width=...)` | `frame.set_width(...)` (compiler rewrites) |
| Text | ManimPango metrics | Pango/Cairo; slightly different widths |
| `color=` kwarg | applied | **silently ignored on several classes** (shim re-applies) |
| Render model | timeline in `construct()` | same, plus a live/GL runtime |
| Seeking | not supported | not supported by default either |

The last point is the one people miss: **ManimGL does not make a scene seekable
by itself.** QWEEPS adds that with `RecordedScene`.

---

## 3. The compiler

Files:

- `src/assistant/visual/ce_native.py` — AST pass + loader.
- `src/assistant/visual/recorded_scene.py` — compat aliases + `RecordedScene`.
- `manimgl_compat.py` (Generative Manim repo) — the constraint-check shim used by
  the clip renderer.

`compile_native_source(source)` performs **only structural changes**:

1. `from manim import *` → `from assistant.visual.recorded_scene import *`.
2. Scene base classes `Scene | MovingCameraScene | ThreeDScene` → `RecordedScene`.
3. `x.set(width=…)` / `.set(height=…)` → `set_width` / `set_height`.
4. Append `self.autoregister(locals())` to `construct()`.

That is deliberately small. Anything that can be handled at runtime is handled
by the shim, not by rewriting source:

- `Create = ShowCreation`, `MathTex = Tex`;
- `color=` wrappers for `Circle`, `Ellipse`, `Dot`, `Text`, `Line`, `Arrow`,
  `Triangle`, `Rectangle`, `RoundedRectangle`, `Square`, `Polygon`, `Arc`,
  `VMobject`;
- `add_updater` wrapper that tolerates one-argument lambdas.

What the compiler **does not** do:

- it does not convert `add_updater` semantics (that is `RecordedScene`'s job);
- it does not fix text metrics;
- it does not infer interaction roles (see `autoregister`).

`load_native_scene(path)` compiles and executes the source, then instantiates
`GenScene`.

---

## 4. RecordedScene: making `construct()` seekable

`RecordedScene` keeps the authored `construct()` intact and records it.

### 4.1 Single forward pass

`play()` and `wait()` step the simulation at a fixed `dt = 1/30`:

```
for each step:
    interpolate active animations
    run updaters (dt) on every family member
    clock += dt
    snapshot the top-level scene graph + updater families
```

Every animation is also stored as `(start, run_time, animation)` so it can be
replayed later.

Why single-pass matters: a later `self.play(mob.animate…)` must start from the
state produced by earlier updaters. Recording first and simulating later would
diverge.

### 4.2 Baking updaters and trails

Stateful effects (breathing halos, ripples, `TracedPath`, labels that follow a
moving object) cannot be reconstructed by replaying animation tracks. They are
**baked**: at every step the recorder stores the ManimGL structured data for the
whole updater mobject:

```python
[(part, part.data.copy()) for part in mob.get_family()]
```

The family matters. `Text`, `Tex` and `SVG` objects are groups: the top-level
`mob.data` has no points because the glyph paths live in children. Copying only
`mob.data` silently freezes those labels — they stay where the build left them
and jump only when an animation moves the group. Copying the family is what
makes labels track their targets.

Consecutive frames whose family data is unchanged are dropped, so a static
label costs one keyframe instead of hundreds.

`evaluate(t)` restores the nearest keyframe:

```python
for part, data in frames[nearest]:
    part.data = data.copy()
```

Structured dtypes cannot be interpolated element-wise, so nearest-frame is the
fallback (33 ms granularity, matching the render cadence).

### 4.3 Updaters have five traps

1. **`has_updaters()` is cached.** Adding an updater after the cache was
   computed leaves it stale, so the updater never runs. The `add_updater`
   wrapper resets `_has_updaters_in_family`.
2. **`updating_suspended` can stay set** after a manimlib animation. The
   recorder therefore runs updaters manually instead of trusting
   `Scene.update_mobjects`.
3. **Updaters can live on children.** `has_updaters()` recurses, but
   `mob.updaters` does not. `_run_updaters()` walks the family and calls each
   member's own updaters; otherwise a `VGroup` whose child follows something
   never moves.
4. **`clear_updaters()` during the scene** (labels are cleared before their
   fade-out) ends the baked timeline. The recorder records the clock when a
   top-level mobject's family loses its updaters (`updater_stop`). After that
   point `evaluate(t)` does **not** restore the last baked frame, so the
   following `FadeOut`/`set_opacity` animation owns the mobject. Restoring the
   last frame would otherwise pin the label and cancel its fade.
5. **`Scene.update_frame()` re-runs updaters.** After `evaluate(t)` restores a
   baked frame, `update_frame()` calls `Scene.update_mobjects(dt=0)`. A stateful
   updater then recomputes from the closure state left at the end of build and
   overwrites the seek state — the breathing halo rendered at one frozen
   opacity. `RecordedScene.update_mobjects` is therefore a no-op; recording
   already ran every updater forward through `_step`.

### 4.4 evaluate(t)

Order matters:

1. reset every animated mobject to the family data captured **before its first
   animation** (`self.initial`). Without this, the result depends on the
   previous playhead value;
2. replay only tracks with `start <= t`, alpha `clip((t - start) / length)`.
   Future tracks are skipped. Applying `alpha = 0` to them instead would let the
   scene's final `FadeOut`/`Indicate` set every object to its **end** state at
   the beginning — objects teleport to their last position;
3. restore the recorded top-level scene graph and rebuild `render_groups`
   (assigning `self.mobjects` alone leaves the camera drawing nothing);
4. restore baked updater families (skipped after `updater_stop`);
5. re-flag bounding boxes (a `Surface` copy carries an unset box);
6. restore the baked camera frame (3D ambient rotation);
7. update the chapter label;
8. apply user camera (`shift`, `width / zoom`);
9. draw selection highlights.

### 4.5 Roles and bounds

`autoregister(locals())` maps CE variable names to UI ids:

| UI id | CE variables |
| --- | --- |
| `neutrophil` | `body`, `nucleus` |
| `receptors` | `receptors` |
| `receptor` | `receptors[0]` |
| `bacterium` | `bacterium` |
| `pamp` | `spikes` |
| `self_cell` | `self_cell` |

Extend `RecordedScene.autoregister` when a scene uses different names.

`metadata(t)` publishes each role's bounding box in 1280×720 pixel coordinates.
The browser hit-tests those boxes; the worker draws the highlight. Selection is
therefore visible inside the render, not as a DOM overlay.

---

## 5. The native worker

Files: `src/assistant/visual/native_live.py`,
`src/assistant/visual/native_host.py`,
`src/assistant/visual/ce_native.py`.

Lifecycle:

1. Browser POSTs `/api/visual/native/state` with
   `{lessonId, time, experiment, selected, camera, revision}`.
2. `NativeHost.update` validates the lesson id, time range, experiment and
   selection, then writes the state line to the worker's stdin.
3. The worker calls `scene.evaluate(t, selected, camera)`,
   `scene.camera.get_image()`, writes `frame.jpg` and `state.json` (bounds,
   camera, GPU, render time).
4. The browser requests `/api/visual/native/frame?sessionId=…`.

Constraints:

- lesson ids must be whitelisted in `NativeHost` (`manim_production`,
  `jose_rizal`, `alu`, `generated`, `wbc`);
- generated/compiled lessons need a manifest with `duration`
  (`visual-studio/public/lessons/wbc_native.json`);
- frames are 1280×720 JPEG; there is no audio track (narration is separate);
- workers live in `/dev/shm/qweeps-manim-*` with `worker.log`, `error.txt`,
  `frame.jpg`, `state.json`.

---

## 6. Frontend

Route: `?lesson=<id>` → `LiveLessonLoader` → `LiveLessonPlayer`.

The player owns the lesson clock. It chooses a stage **per chapter**:

```jsonc
{ "id": "candidates", "renderer": "manimgl", "nativeScene": "wbc" }
{ "id": "rule", "visual": { "layout": "concept", "...": "..." } }
```

| Chapter shape | Stage |
| --- | --- |
| `renderer: "manimgl"` | `NativeLessonCanvas` (native frames) |
| `clip` | `<video>` with `currentTime` sync |
| `scene` | `SceneChapterStage` |
| `visual` | `GeneratedStage` (SVG) |

For a native scene that spans the whole lesson, pass **absolute** lesson time
(the worker's timeline is the lesson's timeline). For a single-chapter scene,
pass `time - chapter.start`.

### Branches

- `ask('branch', question)` → `/api/visual/ask`.
- A lesson may declare:

```json
"branches": [{
  "id": "pamp",
  "keywords": ["pamp", "spike", "lps", "bacterium"],
  "chapter": "pamp-detail",
  "focus": "pamp",
  "reason": "Opening the PAMP spike"
}]
```

- `BrowserLessonStore.answer` matches those keywords and returns
  `browserBranch {lessonId, chapter, focus, visualReason}` instead of spawning a
  new lesson.
- The player saves a checkpoint, jumps to the chapter (same worker → seek), sets
  focus, and offers “Return to …”.

SVG stages zoom the camera on `focus`; native stages seek to the chapter and
reuse whatever camera the scene defines.

---

## 7. Authoring a native beat

1. Write normal ManimCE (`from manim import *`, `class GenScene(MovingCameraScene)`).
2. Put it in `src/assistant/visual/scenes/`.
3. Register a loader in `native_live.main`:

```python
elif lesson_id == "mybeat":
    from assistant.visual.ce_native import load_native_scene
    scene = load_native_scene(Path(__file__).with_name("scenes") / "mybeat.py")
```

4. Whitelist the id in `native_host.py`, add
   `visual-studio/public/lessons/mybeat.json` with `{"duration": <seconds>}`.
5. In the lesson JSON, mark the chapter
   `"renderer": "manimgl", "nativeScene": "mybeat"`.
6. Ensure the variables you want clickable are named as in
   `autoregister` (or extend the map).
7. Test the worker without the browser:

```bash
printf '{"lessonId":"wbc","time":6,"experiment":{},"selected":[],"camera":null}\n' \
  | PYTHONPATH=src ~/.local/share/omarchy-assistant/visual-venv/bin/python \
    -m assistant.visual.native_live /tmp/wbc \
    visual-studio/public/lessons/wbc_native.json \
    visual-studio/public/production/stopwatch.svg wbc
```

Look for `frame.jpg` and `state.json`.

---

## 8. Debugging checklist

| Symptom | Likely cause |
| --- | --- |
| “Preparing the native Manim scene…” forever | worker crashed; read `worker.log` / `error.txt` in `/dev/shm/qweeps-manim-*` |
| `AttributeError: 'Wbc...' has no attribute 'settings'` | scene did not subclass `RecordedScene` / `build()` missing |
| `'CameraFrame' object has no attribute 'set'` | compiler did not rewrite `.set(width=)` |
| `ufunc ... structured dtype` | tried to lerp `mob.data`; use nearest keyframe |
| Labels frozen while objects move | only top-level `mob.data` baked; bake the family, see §4.2 |
| Glow/pulse frozen at one value | `Scene.update_mobjects` re-ran the updater with `dt=0`; see §4.3 |
| Click selects nothing | role missing from `autoregister`, or bounds outside the frame |
| Scrub shows the wrong trail | stateful effect not baked |
| Scrub skips animations, or state depends on seek order | history cache / partial replay; reset `initial`, see §4.4 |
| Objects appear at their end position at the start | future track applied with `alpha=0`; skip tracks that have not started |
| Text shifts vs CE | Pango metric drift; not yet compensated |

Useful commands:

```bash
# studio server (port 4174)
PYTHONPATH=src .venv/bin/python -m assistant.visual.server

# rebuild the studio
cd visual-studio && npm run build

# tests
cd visual-studio && npm test
.venv/bin/python -m pytest tests/test_visual_learning.py tests/test_visual_pedagogy.py -q
```

---

## 9. Known limits of the current runtime

- **720p JPEG** frames, 30 fps target; a live worker is required.
- **Text metrics** differ from CE; the constant width-scale heuristic is not
  implemented yet.
- **Structured snapshots** are nearest-keyframe, so fast stateful effects can
  lag by up to 33 ms.
- **Purely visual state** (glow blur, GPU effects) depends on what manimlib
  draws; cairo-only CE effects may look different.
- **Camera moves** are supported only if the CE scene animates the frame; the
  WBC scene does not.
- **Branches** currently retarget chapters; authored per-branch sub-scenes are
  still hand-written.
- **No audio** in the worker; narration and captions stay in the lesson layer.

---

## 10. File map

| Path | Purpose |
| --- | --- |
| `src/assistant/visual/scenes/*.py` | ManimCE sources (authoring) |
| `src/assistant/visual/ce_native.py` | AST compiler + loader |
| `src/assistant/visual/recorded_scene.py` | compat aliases + `RecordedScene` |
| `src/assistant/visual/native_live.py` | worker: state in, frames + bounds out |
| `src/assistant/visual/native_host.py` | worker lifecycle, validation, manifests |
| `src/assistant/visual/browser_lessons.py` | lesson loading, branch matching |
| `visual-studio/src/live/LiveLessonPlayer.tsx` | chapter clock, stage choice, branches |
| `visual-studio/src/learning/NativeLessonCanvas.tsx` | native frame transport + hit-testing |
| `visual-studio/public/lessons/*.json` | native manifests (duration) |
| `bundled-lessons/browser-lessons/*/lesson.json` | lesson content + chapter renderers |
