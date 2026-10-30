# Use Manim’s visual range when it helps the inference

The teaching method is not a restriction to boxes, circles and arrows. The user
explicitly permits SVGs and compatible assets. Choose the representation first,
then use the rendering path that can express it faithfully.

## Native interactive delivery

When the user expects the authored Manim examples’ visual range, use actual native
Manim rendering. The production lesson now runs a trusted ManimGL scene on the GPU,
streams its frames locally, and projects semantic hit regions for selection. Its
clock supports pause, arbitrary seek and bounded parameter experiments. The browser
provides controls and input; it does not redraw the lesson as simplified SVG.
Do not silently substitute a primitive browser renderer for a native-quality request.
Retain SVG/Canvas for existing lessons or explicitly suitable simple diagrams.

Native live scenes and baked CE videos have different runtimes. Check APIs and
measure frame time on the actual machine. Inspect transitions, reverse seeks,
parameter changes and camera projections. A native renderer alone does not ensure
the authored teaching has the same quality as a reviewed film.

Fish narration uses cached audio clips and a persistent browser media playhead.
Pause must preserve the clip and position; resume must play that same clip. Test
pause during synthesis, before a narration cue, mid-speech, and after an answer.
Do not mark a cue as spoken before it fires. A cancelled request must not start
audio later. Confirm real media state as well as unit tests.

## Capability ladder

- The live browser diagram compiler currently supports a small validated primitive
  set. It is useful for simple generated branches; its limits are not Manim’s limits.
- Authored interactive scenes can use SVG paths, groups, masks, axes, persistent
  object identity, parameterized geometry, data-bound bars and plots. Pair them with
  a native CE export when appropriate. An SVG browser scene is not an embedded
  Manim runtime; do not call it one.
- Native Manim CE supports VMobject paths, polygons and booleans, Axes and plotted
  functions, graphs, SVG/vector artwork, images, ValueTracker-driven dependencies,
  matching transforms, camera movement and 3D geometry. Use the capabilities that
  expose the concept; a 3D scene or moving camera is not inherently better teaching.

Study relevant examples from the [official CE gallery](https://docs.manim.community/en/stable/examples.html):
MovingAngle/MovingDots for linked quantities, PolygonOnAxes for constrained
geometry, graph/area examples for quantities, and the camera/3D examples when
space or viewpoint is the actual question. These are API patterns, not a universal
lesson structure. The supplementary 3Blue1Brown studies supply teaching operations;
advanced rendering does not substitute for their explanatory decisions.

## SVG and compatible assets

[SVGMobject](https://docs.manim.community/en/stable/reference/manim.mobject.svg.svg_mobject.SVGMobject.html)
imports SVG geometry into native Manim. Prefer original or appropriately licensed
assets. Establish what their parts mean; give meaningful subobjects stable roles
so a selection, morph or highlight corresponds to a concept. Normalize the viewBox,
convert unsupported text/effects when necessary, and inspect the CE import. Browser
SVG filters, foreignObject content and external fonts are not guaranteed to survive
as native Manim geometry. Do not silently replace a failed import with a generic box.

Keep arbitrary model code out of the executable path. Native authored compilers may
interpolate validated data into trusted source. Model-proposed custom source needs
its own review and execution boundary; permission to use SVG is not permission to
execute arbitrary fetched Python. Exports should carry their source assets and
current parameter values so the result is reproducible.

## Production lesson application

The interactive time/cost lesson uses the same recorded usage categories in token
and dollar bars, selectable process intervals and a live tradeoff plot. Its native live scene and CE export import the same original stopwatch SVG, uses Axes, ValueTracker and
object transforms. Local rasterization work is independent from token billing;
SVG compatibility and advanced geometry are tools for making that distinction
visible, not additional services to bill.
