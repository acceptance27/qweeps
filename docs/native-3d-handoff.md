# 3D native chapter — handoff

## Status: complete

The 3D blood lesson renders and seeks natively at
`/?lesson=dbb634c1d142045a84dcbc40ef8a7d36`.

## What was fixed

The bug was **scene-graph structure**, not opacity. `FadeOut(Group(rbc, wbc,
plts, haem, release))` created a wrapper Group that `play()` added to the
scene; removing the individual cells left them alive as children of that
wrapper, so any earlier seek showed them. Three changes in
`RecordedScene`:

1. `play()` calls `anim.clean_up_from_scene(self)` after `finish()` and takes a
   post-animation snapshot — matching manimlib's removal semantics.
2. `_snapshot()` records the exact top-level mobject tuple per tick
   (`scene_baked`), and `evaluate(t)` restores it with `assemble_render_groups()`
   instead of guessing from fade tracks. Assigning `self.mobjects` directly is
   not enough: `render_groups` must be rebuilt or the camera draws nothing.
3. Track replay now keys its "already handled" set on the animation's whole
   family (`get_family()` ids), not a single `id(anim.mobject)`. `LaggedStart`
   wraps the struts in a different Group, so a later `FadeOut(struts)` was not
   recognised as future and rewound the struts to full size at t = 0.

Also:

- Role reveal/hide now combines opacity probing with scene-graph presence, so
  Surface roles (rbc/wbc/plts) hide at their `FadeOut`.
- The role-fade probe snapshots/restores `mob.data`; `anim.interpolate(1)`
  otherwise permanently scales/blanked the real mobject during build.
- `Surface.become()` copies an unset bounding box, so `evaluate()` re-flags
  bounding boxes after replay; otherwise bounds vanished for 3D roles.
- The `subtitle` fades with the lattice instead of lingering into chapter 2
  (patched in `blood_3d_lesson.py` and the generative-manim source).

## Wiring

- Scene: `src/assistant/visual/scenes/blood_3d_lesson.py` (`GenScene`,
  `ThreeDScene`, compiled by `ce_native.load_native_scene`).
- `native_live`: lesson id `blood3d` → that scene.
- `native_host`: whitelist + update branch + `public/lessons/blood3d_native.json`
  (`{"duration": 28.6}`).
- `NativeLessonCanvas`: `blood3d` sends an empty experiment, like `wbc`.
- Lesson: `bundled-lessons/browser-lessons/dbb634c1d142045a84dcbc40ef8a7d36/lesson.json`
  — 3 chapters, all `renderer: manimgl`, `nativeScene: blood3d`:
  - `lattice` 0–11: trabeculae + marrow (roles `struts`, `marrow`)
  - `stem-cells` 11–16: HSC division (roles `hsc`, `daughter-a`, `daughter-b`)
  - `lineages` 16–28.57: rbc/wbc/plts, release, closing

## Measured

- build (whole 28.6 s scene) ~3.5 s
- seek/render through the host: 40–190 ms per state
- native frame ~9 ms; `evaluate(t)` ~0.1 s
- bounds verified at t = 1/6/12/14/16.5/18/21/24/26/28
- `npm test`: 65 pass; `pytest tests/test_visual_*.py`: 190 pass

## Env

- worker: `~/.local/share/omarchy-assistant/visual-venv/bin/python -m assistant.visual.native_live`
- studio: `PYTHONPATH=src .venv/bin/python -m assistant.visual.server` (4174)
- restart the studio after changing `native_host.py`/`native_live.py`.
