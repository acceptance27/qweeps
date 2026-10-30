# Manim Community OpenGL and checkpoint investigation

This compares the current QWEEPS native ManimGL worker with a possible Manim
Community Edition (CE) OpenGL adapter. It is a feasibility investigation, not
a migration or a claim that one renderer automatically teaches better.

## Authoring versus learner interaction

3Blue1Brown's `checkpoint_paste()` is an authoring aid: it reads Python code from
the clipboard, can save/restore a scene state keyed by a leading comment, and
executes the block in an interactive shell. It does not itself supply QWEEPS's
learner timeline, object hit regions, synchronized voice, semantic selection,
AI answers, or branch-and-return behavior. Those are application features that
would require a CE adapter. Arbitrary Python execution must remain behind an
appropriate execution boundary.

A third-party [manim-interactive](https://github.com/mdda/manim-interactive)
plugin offers a similar CE development workflow. The repository's current
[dependency declaration](https://raw.githubusercontent.com/mdda/manim-interactive/main/pyproject.toml)
requires Python 3.13+ and IPython >=9.5; the existing CE environment here uses
Python 3.12.15. It would require a separate compatible environment and integration
review. The plugin was not installed or tested in this investigation. CE's
[OpenGL FAQ](https://docs.manim.community/en/stable/faq/opengl.html) notes both
missing reference pages for some OpenGL classes and an IPython-dependent embed
issue; the documented workaround and the plugin's requirements should be tested
together, not assumed compatible or incompatible.

CE’s [scene implementation](https://docs.manim.community/en/stable/_modules/manim/scene/scene.html)
checks that `embed()` has a live preview and skips it when writing a movie;
`interactive_embed()` likewise requires an OpenGL window and no active media
output. Our current worker renders offscreen frames for the browser, so this
editor-oriented embed workflow is not a drop-in replacement for that worker.
A separate native adapter or architecture change would be needed.

## Local probe, 2026-10-28

Environment: Manim CE 0.22.0 on the existing GPU-equipped host. ManimGL 1.7.2
is installed separately. Probes ran as short, isolated MP4 renders, not as a
benchmark or a test of all API support.

| Same idea | Cairo | CE OpenGL 0.22.0 |
| --- | --- | --- |
| `Create(SVGMobject(...))` | Passed in combined scene | Passed separately |
| `Write(Text(...))` | Passed in combined scene | Failed with a NumPy shape/broadcast error |
| `MovingCameraScene` with `self.camera.frame.animate` | Passed | `OpenGLCamera` had no `frame` attribute |
| `FadeIn(Text(...))` | Not separately tested | Passed |
| `self.camera.animate.scale(...).shift(...)` in `Scene` | Not separately tested | Passed |

For example, the failing CE OpenGL text probe was:

```python
from manim import *
class TextOnly(Scene):
    def construct(self):
        self.play(Write(Text('Native text')), run_time=.3)
```

These results are specific to the installed version and environment. They do
not establish whether CE 0.22.1 fixes the text issue or whether other constructs
behave identically. CE's [installation FAQ](https://docs.manim.community/en/stable/faq/installation.html)
explains that CE and ManimGL are separate projects, and its documentation warns
that their APIs are not interchangeable. The existing ManimGL scene code and
frame/interaction bridge require porting, not a renderer flag change.

## Recommended evaluation

Keep the existing version working. Implement one small representative lesson in
CE with the same storyboard and semantic objects; try CE OpenGL for a live adapter
and CE Cairo for export. Compare object creation, text, SVG, camera, 3D if needed,
selection, scrubbing, rewind, a question branch, synchronized speech, and the
appearance and timings of actual frames. Measure startup and sustained frame time
on this machine. Check the exact CE and plugin versions in an isolated environment
before choosing an engine. The result should be judged on visual teaching quality,
features, reliability and maintenance, not the number of rendered pixels or FPS alone.
