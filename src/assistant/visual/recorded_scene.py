"""RecordedScene: ManimCE-authored scenes as seekable ManimGL timelines.

Single forward pass: play()/wait() step the clock at a fixed dt, interpolate
the active animations, run updaters, and snapshot ManimGL's raw `mob.data`
buffer for any mobject carrying an updater or trail. evaluate(t) replays the
animation tracks and restores the nearest baked snapshot.

CE names that ManimGL lacks are aliased here, and CE's ignored `color=` kwargs
are re-applied so a compiled CE file keeps its palette.
"""
from __future__ import annotations

import numpy as np
from manimlib import *
from manimlib.animation.animation import prepare_animation
import inspect


_orig_add_updater = Mobject.add_updater


def _tolerant_add_updater(self, func, **kwargs):
    try:
        params = len(inspect.signature(func).parameters)
    except (TypeError, ValueError):
        params = 2
    result = _orig_add_updater(self, (lambda mob, dt: func(mob)) if params <= 1 else func, **kwargs)
    # manimlib caches has_updaters(); invalidate it or the updater is skipped.
    self._has_updaters_in_family = None
    return result


Mobject.add_updater = _tolerant_add_updater


FPS = 30
DT = 1.0 / FPS

_VMobject_base = VMobject
Create = ShowCreation
Uncreate = Uncreate if "Uncreate" in globals() else ShowCreation
MathTex = Tex


# ------------------------------------------------------------ CE color kwargs
def _wrap_color(cls):
    def factory(*args, **kwargs):
        color = kwargs.pop("color", None)
        obj = cls(*args, **kwargs)
        if color is not None:
            obj.set_color(color)
        return obj

    factory.__name__ = getattr(cls, "__name__", "wrapped")
    return factory


for _name in ("Circle", "Ellipse", "Dot", "Text", "Tex", "Line", "Arrow", "Triangle",
              "Rectangle", "RoundedRectangle", "Square", "Polygon", "Arc", "VMobject"):
    if _name in globals():
        globals()[_name] = _wrap_color(globals()[_name])


# ManimCE 3D primitives are VMobjects; manimlib's Surface is not.
from manimlib.mobject.types.surface import Surface as _Surface


def _surface_fill(self, color=None, opacity=None, **kwargs):
    if color is not None:
        self.set_color(color)
    if opacity is not None:
        self.set_opacity(opacity)
    return self


def _surface_stroke(self, *args, **kwargs):
    return self


def _group_set_opacity(self, opacity, recurse=True):
    for mob in self.get_family():
        if mob is self:
            continue
        try:
            mob.set_opacity(opacity, recurse=False)
        except Exception:
            pass
    return self


_Group_cls = globals().get("Group")
if _Group_cls is not None:
    _orig_group_opacity = _Group_cls.set_opacity
    _Group_cls.set_opacity = _group_set_opacity

_Surface.set_fill = _surface_fill
_Surface.set_stroke = _surface_stroke


def _wrap_3d(cls):
    def factory(*args, **kwargs):
        color = kwargs.pop("color", None) or kwargs.pop("fill_color", None)
        kwargs.pop("shade_in_3d", None)
        obj = cls(*args, **kwargs)
        if color is not None:
            obj.set_color(color)
        return obj
    factory.__name__ = getattr(cls, "__name__", "wrapped3d")
    return factory


for _name in ("Sphere", "Cylinder", "Cone", "Torus", "Cube", "Prism"):
    if _name in globals():
        globals()[_name] = _wrap_3d(globals()[_name])


class RecordedScene(Scene):
    lesson_id = "wbc"
    chapter_starts = (0.0, 4.6, 10.4, 15.2, 23.4)
    chapter_titles = ("Contact is not yet a decision", "Two candidates at once",
                      "Inside a PAMP spike", "From match to response", "The decision rule")

    def __init__(self):
        super().__init__(
            camera_config={"resolution": (1280, 720), "fps": FPS,
                           "background_color": "#071117", "max_allowable_norm": 1000},
            file_writer_config={"write_to_movie": False},
        )
        self.clock = 0.0
        self.duration = 0.0
        self.tracks = []            # (start, run_time, animation)
        self.baked = {}             # id(mob) -> (mob, [(t, data.copy())])
        self.updaters_seen = {}     # id(top) -> (mob, seen)
        self.updater_stop = {}      # id(top) -> clock its updaters were cleared
        self.role_reveal = {}       # id(role mob) -> first clock it is animated
        self.role_hide = {}         # id(role mob) -> fade-out clock
        self.frame_baked = []       # (t, camera frame state)
        self.scene_baked = []       # (t, tuple(top-level mobjects))
        self.initial = {}           # id(mob) -> (mob, [(part, data)]) before animation
        self.roles = {}
        self.settings = None
        self.build()

    # ------------------------------------------------------------- recording
    # ManimCE ThreeDScene API
    def set_camera_orientation(self, phi=70 * DEGREES, theta=-30 * DEGREES, zoom=1.0,
                               center=None, frame_center=None, **kwargs):
        self.frame.set_phi(phi)
        self.frame.set_theta(theta)
        if zoom:
            self.frame.set_height(8.0 / zoom)
        target = center if center is not None else frame_center
        if target is not None:
            self.frame.move_to(target)

    def begin_ambient_camera_rotation(self, rate=0.1, **kwargs):
        self.frame.add_ambient_rotation(rate if abs(rate) > 1e-4 else 1 * DEGREES)

    def stop_ambient_camera_rotation(self):
        self.frame.clear_updaters()

    def add_fixed_in_frame_mobjects(self, *mobjects):
        for mob in mobjects:
            mob.fix_in_frame()
            self.add(mob)

    def _capture_initial(self, mob):
        """Remember a mobject's family data before the first animation moves it."""
        if id(mob) in self.initial:
            return
        self.initial[id(mob)] = (mob, [(part, part.data.copy()) for part in mob.get_family()])

    def _snapshot(self):
        # Exact scene graph, so a seek restores which mobjects exist at that
        # moment. Fade bookkeeping alone cannot: a later FadeOut(Group(...))
        # adds a wrapper that keeps already-hidden children alive.
        self.scene_baked.append(
            (self.clock, tuple(m for m in self.mobjects if m is not self.select_group))
        )
        for mob in self.mobjects:
            self._capture_initial(mob)
        for mob in self.mobjects:
            if not getattr(mob, "has_updaters", lambda: False)():
                continue
            entry = self.baked.setdefault(id(mob), (mob, []))
            # A Text/SVG is a group whose points live in child paths, so a
            # top-level data copy is empty. Bake the whole family, and skip
            # ticks where nothing changed (labels are still most of the time).
            parts = list(mob.get_family())
            if entry[1]:
                previous = entry[1][-1][1]
                if (len(previous) == len(parts)
                        and all(np.array_equal(old, part.data)
                                for (_, old), part in zip(previous, parts))):
                    continue
            entry[1].append((self.clock, [(part, part.data.copy()) for part in parts]))
        if getattr(self.frame, "has_updaters", lambda: False)():
            self.frame_baked.append((self.clock, {
                "center": self.frame.get_center().copy(),
                "width": float(self.frame.get_width()),
                "phi": float(self.frame.get_phi()),
                "theta": float(self.frame.get_theta()),
                "gamma": float(self.frame.get_gamma()),
            }))

    def _run_updaters(self, dt):
        # Bypass manimlib's cached has_updaters() and updating_suspended flag:
        # both can be stale after manimlib animations. Run updaters on every
        # family member, not just top-level mobjects: `has_updaters()` recurses,
        # so a label whose updater lives on a child must run too.
        # The CameraFrame is not in self.mobjects (build() clears the scene),
        # so its ambient-rotation updater must be run explicitly.
        tops = list(self.mobjects)
        if not any(top is self.frame for top in tops):
            tops.append(self.frame)
        for top in tops:
            active = False
            for mob in top.get_family():
                updaters = list(getattr(mob, "updaters", []))
                if not updaters:
                    continue
                active = True
                for updater in updaters:
                    if "dt" in getattr(updater, "__code__", type("x", (), {"co_varnames": ()})).co_varnames:
                        updater(mob, dt=dt)
                    else:
                        updater(mob)
            if active:
                self.updaters_seen[id(top)] = (top, active)
                self.updater_stop.pop(id(top), None)
            elif id(top) in self.updaters_seen and id(top) not in self.updater_stop:
                self.updater_stop[id(top)] = self.clock

    def update_mobjects(self, dt=0):
        # Updaters are baked into keyframes. update_frame() calls this with
        # dt=0, which would re-run a stateful updater against the closure state
        # left at the end of build and overwrite the seek-time frame — e.g. a
        # breathing halo would render at one frozen opacity forever.
        pass

    def _step(self, dt, prepared=None, alpha=1.0):
        if prepared:
            for anim in prepared:
                anim.interpolate(alpha)
        self._run_updaters(dt)
        self.clock += dt
        self._snapshot()

    def play(self, *animations, run_time=1.0, **kwargs):
        prepared = [prepare_animation(a) for a in animations]
        rate_func = kwargs.get("rate_func")
        for anim in prepared:
            anim.set_run_time(run_time)
            if rate_func is not None:
                anim.rate_func = rate_func
            anim.begin()
            if anim.mobject is not self.frame:
                self.add(anim.mobject)
                self._capture_initial(anim.mobject)
        for mob in self.mobjects:
            self._capture_initial(mob)
        start = self.clock
        for anim in prepared:
            target = anim.mobject
            for mobs in self.roles.values():
                for role_mob in mobs:
                    family = role_mob.get_family()
                    if target is role_mob or target in family or role_mob in target.get_family():
                        previous = self.role_reveal.get(id(role_mob))
                        self.role_reveal[id(role_mob)] = start if previous is None else min(previous, start)
        steps = max(1, int(round(run_time * FPS)))
        for k in range(1, steps + 1):
            self._step(DT, prepared, k / steps)
        for anim in prepared:
            anim.finish()
            anim.clean_up_from_scene(self)
            self.tracks.append((start, run_time, anim))
        # Capture post-animation removals (FadeOut/replacement) at the same clock.
        self._snapshot()

    def wait(self, run_time=1.0):
        steps = max(1, int(round(run_time * FPS)))
        for _ in range(steps):
            self._step(DT)

    def build(self, settings=None):
        self.settings = settings if settings is not None else {}
        self.clear()
        self.tracks = []
        self.baked = {}
        self.updaters_seen = {}
        self.updater_stop = {}
        self.role_reveal = {}
        self.role_hide = {}
        self.frame_baked = []
        self.scene_baked = []
        self.initial = {}
        self.roles = {}
        self.clock = 0.0
        self.frame.move_to(ORIGIN).set_width(14.22)
        self.chrome = "chapter_titles" in type(self).__dict__
        self.select_group = VGroup()
        self.add(self.select_group)
        if self.chrome:
            self.header = Text("QWEEPS · NATIVE MANIMGL", font_size=16).set_color("#8bd0df")
            self.header.to_corner(UL, buff=0.3).fix_in_frame()
            self.chapter_label = Text(self.chapter_titles[0], font_size=24).move_to(UP * 3.2).fix_in_frame()
            self.add(self.header, self.chapter_label)
        self.construct()
        self.duration = self.clock
        # Roles are registered at the end of construct; derive their reveal time
        # from the recorded tracks so bounds only appear when the object does.
        for mobs in self.roles.values():
            for role_mob in mobs:
                starts = [
                    start for start, _length, anim in self.tracks
                    if anim.mobject is role_mob
                    or anim.mobject in role_mob.get_family()
                    or role_mob in anim.mobject.get_family()
                ]
                present = [
                    clock for clock, graph in self.scene_baked
                    if self._in_graph(role_mob, graph)
                ]
                reveal = min(starts) if starts else (min(present) if present else 0.0)
                if present:
                    reveal = min(reveal, min(present))
                self.role_reveal[id(role_mob)] = reveal

                # Opacity fades (2D VMobjects). Probing an animation mutates its
                # target, so snapshot the role's buffers and restore afterwards.
                saved = [(part, part.data.copy()) for part in role_mob.get_family()]
                hide = None
                for start, _length, anim in self.tracks:
                    target = anim.mobject
                    if not (target is role_mob or target in role_mob.get_family()
                            or role_mob in target.get_family()):
                        continue
                    anim.interpolate(1)
                    opacities = []
                    for part in role_mob.family_members_with_points():
                        try:
                            opacities.append(max(part.get_fill_opacity(), part.get_stroke_opacity()))
                        except AttributeError:
                            opacities.append(float(getattr(part, "opacity", 1)))
                    hide = start if (opacities and max(opacities) <= 0.05) else None
                for part, data in saved:
                    part.data = data
                # Scene-graph removal (3D surfaces ignore opacity).
                absent = None
                seen = False
                for clock, graph in self.scene_baked:
                    here = self._in_graph(role_mob, graph)
                    if here:
                        seen = True
                    elif seen:
                        absent = clock
                        break
                if absent is None:
                    absent = self.duration
                if hide is None:
                    hide = absent
                else:
                    hide = min(hide, absent)
                if hide < self.duration - 1e-6:
                    self.role_hide[id(role_mob)] = hide

    # ------------------------------------------------------------- replay
    def _in_graph(self, mob, graph):
        """True if `mob` or any of its family is present in the recorded scene."""
        family = {id(part) for part in mob.get_family()}
        for top in graph:
            if id(top) in family:
                return True
            if any(id(part) in family for part in top.get_family()):
                return True
        return False

    def _restore_scene(self, t):
        """Restore the exact top-level mobject set recorded at the nearest tick."""
        if not self.scene_baked:
            return
        times = [row[0] for row in self.scene_baked]
        index = min(range(len(times)), key=lambda i: abs(times[i] - t))
        self.mobjects = list(self.scene_baked[index][1])
        self.assemble_render_groups()

    def evaluate(self, t, selected, camera):
        # Reset every animated mobject to the state it had before its first
        # animation, then replay only tracks that have started. Without the
        # reset the result depends on where the playhead came from; applying
        # alpha 0 to future tracks instead would let the final FadeOut teleport
        # objects to their end positions at the start of the scene.
        for mob, parts in self.initial.values():
            for part, data in parts:
                part.data = data.copy()
        for start, length, anim in self.tracks:
            if t < start:
                continue
            anim.interpolate(float(np.clip((t - start) / length, 0, 1)))
        self._restore_scene(t)
        # restore baked snapshots (nearest keyframe; lerp when shapes match)
        for mob, frames in self.baked.values():
            if not frames:
                continue
            if t > self.updater_stop.get(id(mob), float("inf")):
                continue  # updater was cleared: later animations own this mobject
            times = [row[0] for row in frames]
            if t <= times[0]:
                chosen = frames[0][1]
            elif t >= times[-1]:
                chosen = frames[-1][1]
            else:
                index = int(np.searchsorted(times, t))
                before, after = index - 1, index
                pick = after if abs(times[after] - t) < abs(t - times[before]) else before
                chosen = frames[pick][1]
            for part, data in chosen:
                part.data = data.copy()
        # Surface.become() copies the target's (unset) bounding box; re-flag it
        # so bounds and hit-testing use the current geometry. Role groups may be
        # split out of the scene graph, so refresh them explicitly too.
        for mob in self.mobjects:
            try:
                mob.refresh_bounding_box(recurse_down=True)
            except Exception:
                pass
        for mobs in self.roles.values():
            for mob in mobs:
                try:
                    mob.refresh_bounding_box(recurse_down=True)
                except Exception:
                    pass
        if self.frame_baked:
            times = [row[0] for row in self.frame_baked]
            index = min(range(len(times)), key=lambda i: abs(times[i] - t))
            state = self.frame_baked[index][1]
            self.frame.set_phi(state["phi"])
            self.frame.set_theta(state["theta"])
            self.frame.set_gamma(state["gamma"])
            self.frame.move_to(state["center"])
            self.frame.set_width(state["width"])
        chapter = self.chapter_at(t)
        if self.chrome and getattr(self, "_active_chapter", None) != chapter:
            self.chapter_label.become(Text(self.chapter_titles[chapter], font_size=24).move_to(UP * 3.2).fix_in_frame())
            self._active_chapter = chapter
        if camera:
            self.frame.shift([camera.get("x", 0), camera.get("y", 0), 0])
            self.frame.set_width(self.frame.get_width() / max(.3, min(3, camera.get("zoom", 1))))
        highlights = []
        for key in selected:
            for mob in self.roles.get(key, []):
                highlights.append(SurroundingRectangle(mob, buff=.12).set_stroke("#FFFF00", 2).set_fill(opacity=0))
        if highlights or self.select_group.submobjects:
            self.remove(self.select_group)
            self.select_group = VGroup(*highlights)
            if highlights:
                self.add(self.select_group)

    def chapter_at(self, t):
        index = 0
        for i, start in enumerate(self.chapter_starts):
            if t >= start:
                index = i
        return min(index, len(self.chapter_titles) - 1)

    def autoregister(self, names):
        """Register a deliberate click map from the scene's own variables."""
        def add(key, mob):
            if isinstance(mob, Mobject):
                self.roles.setdefault(key, []).append(mob)

        add("neutrophil", names.get("body"))
        add("nucleus", names.get("nucleus"))
        receptors = names.get("receptors")
        if isinstance(receptors, VGroup):
            for index, part in enumerate(receptors.submobjects, 1):
                add(f"receptor-{index}", part)
        add("bacterium", names.get("bacterium"))
        add("pamp", names.get("spikes"))
        add("self_cell", names.get("self_cell"))
        add("cytokines", names.get("cytokines"))
        add("phagosome", names.get("vesicle"))
        add("signal", names.get("signal"))
        add("match", names.get("match"))
        add("digest", names.get("digest"))
        add("helper-1", names.get("helper_one"))
        add("helper-2", names.get("helper_two"))
        add("hsc", names.get("hsc"))
        add("daughter-a", names.get("daughter_a"))
        add("daughter-b", names.get("daughter_b"))
        for key in ("struts", "marrow", "rbc", "wbc", "plts", "backdrop", "vessel", "flow"):
            add(key, names.get(key))

    def metadata(self, t):
        center = self.frame.get_center()
        width = self.frame.get_width()
        height = self.frame.get_height()
        bounds = []
        for key, mobs in self.roles.items():
            for mob in mobs:
                if mob.get_width() < .003:
                    continue
                if t + 1e-6 < self.role_reveal.get(id(mob), 0):
                    continue
                hide = self.role_hide.get(id(mob))
                if hide is not None and t >= hide - 1e-6:
                    continue
                lo = mob.get_bounding_box()[0]
                hi = mob.get_bounding_box()[2]
                if hi[0] < center[0] - width / 2 or lo[0] > center[0] + width / 2:
                    continue
                if hi[1] < center[1] - height / 2 or lo[1] > center[1] + height / 2:
                    continue
                bounds.append({
                    "id": key,
                    "x1": float(((lo[0] - center[0]) / width + .5) * 1280),
                    "x2": float(((hi[0] - center[0]) / width + .5) * 1280),
                    "y1": float((.5 - (hi[1] - center[1]) / height) * 720),
                    "y2": float((.5 - (lo[1] - center[1]) / height) * 720),
                })
        return {"backend": "ManimGL/OpenGL", "lessonId": self.lesson_id, "time": t,
                "camera": {"x": float(center[0]), "y": float(center[1]), "width": float(width)},
                "bounds": bounds, "gpu": self.camera.ctx.info.get("GL_RENDERER", "OpenGL")}

    def validate_settings(self, raw):
        if raw not in ({}, None):
            raise ValueError("This lesson has no experiment controls")
        return {}
