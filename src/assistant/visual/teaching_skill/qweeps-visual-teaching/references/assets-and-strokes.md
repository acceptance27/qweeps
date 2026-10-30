# Assets, descriptions and stroke development

The user rejected the sparse live Rizal lesson in favor of the supplied
`HyperFramesRizalStudio.tsx`. They explicitly allow copying that storyboard.
What worked: chronological chapters, descriptive headings, dates, explanations
attached to objects, and continuous anchored stroke drawing. What did not work:
invented geographic contours. Preserve the useful method without treating every
claim or exact number in the reference as evidence.

## Source recognizable geometry first

Search the existing asset collection and suitable SVG/icon/diagram sources before
inventing the outline of an eye, pen, person, building or geographic region. Use
domain diagrams when internal anatomy or mechanism matters; a generic eye icon
cannot establish the position of the lens. Use sourced geographic data for maps,
and construct mathematical/circuit geometry from its underlying rules.

Choose assets for recognizability, semantic parts, visual detail and style fit.
Their availability is not an excuse to simplify the teaching to unrelated icons.
Prefer a sufficiently detailed source illustration when it is the focal object.
Preserve source metadata quietly; do not turn the user's personal learning task
into a licensing discussion or use licensing as a reason to draw a worse substitute.
Do not claim to have fetched an asset when retrieval is unavailable. Report the
specific gap and reuse an available suitable asset where possible.

For live animation, inline vetted vector geometry so its parts can be traced,
highlighted and selected. Remove unrelated source annotations, external resource
links and executable content. Retain meaningful compound paths and holes. Label
generic illustrations as illustrations rather than pretending they reconstruct
a historic building, uniform or machine.

## Text is part of the teaching

The viewer may not know the actors, places or terms. Use descriptive headings,
dates and short explanatory sentences beside the relevant object. For example:
“Ophthalmology is the study and treatment of eye disease” teaches more than
“Eye care.” Explain what changed and why it matters; don't require the narrator
or a chat question to supply every missing definition.

Choose the amount of text for the representation and reading time. A comparison
or historical dossier may legitimately need several lines per object. Reveal
those lines in a useful order and hold them long enough to read. Keep context
attached to the diagram instead of relegating all meaning to a bottom subtitle.
The caption-free test is a diagnostic for decorative geometry, not a delivery
style that forbids explanations. Review the complete infographic for comprehension
as well as checking that its connections/comparisons encode a real relationship.

## Construct detail over time

A whole-group fade is not a path construction. The accepted ZIP measures each
geometry element, hides its stroke, traces from the starting point and then fills
it, staggering the parts. The live implementation uses `getTotalLength()` once
and normalizes `pathLength` to 1. Imported paths, rectangles, circles and lines
all need valid initial dash and fill states before their first visible frame.
When GSAP drives normalized offsets through CSS, set `autoRound:false`: its
default pixel rounding turns a 1→0 dash tween into two states, making the line
pop into existence. SVG attribute interpolation or measured, non-normalized dash
lengths are alternatives. Verify fractional intermediate offsets in the browser.

Order parts deliberately: frame/context, primary contour, internal detail,
annotation and conclusion. Preserve the final intended fill opacity. Delay an
arrowhead until its connector reaches the destination. Do not animate a full
connection into existence merely by fading its parent or changing its opacity.
Not every word needs tracing: readable supporting prose can arrive with a brief
stagger while focal glyph outlines or diagram strokes are drawn.

Check real intermediate frames around a reveal, not just the completed frame.
At the start the relevant stroke should be hidden, in the middle partially
drawn, and at the end complete. Rewind and revisit the same time; geometry,
dash state and fill must reconstruct without replaying earlier frames. Check
selection, zoom and the conversation sidebar at the actual working window size.

## Mechanism diagrams

Use the diagram region as a spatial stage, rather than arranging another row of
cards with a tiny animated icon in each. Preserve a recognizable object while
its position, geometry or relation changes. A translation should carry an input
to an interaction or show a quantity's direction; a scale change should encode
a stated quantity. Small decorative bobs, nudges and pulses do not demonstrate
an interaction. Coordinate related objects on a shared semantic cue so the
relationship actually changes on screen. Keep mathematical labels dimensionally
correct and distinguish schematic trajectories from a computed simulation.

In the browser diagram layout, each group's caption area adapts to its fixed
title and description; the artwork above it can move independently. Keep diagram
titles brief and bodies roughly 8–14 words so their captions fit. Use the other
infographic layouts when longer descriptions are the main teaching material.
Review partial construction, the important change and the finished state; do
not approve a mechanism merely because its symbols and prose are readable.

## Generated diagram text and moving groups

The live custom-art renderer uses a square 100×100 local SVG, fitted into the
node's available artwork area. Text primitives are **center anchored** at `(x,y)`,
not left anchored. Use a central x-coordinate for a centered label; reserve half
its measured width on each side. Long labels placed at x=8 spill leftward.
The renderer enforces at least 18 stage pixels for artwork text, so a nominal
local font size of 6 does not guarantee tiny text. Leave sufficient real screen
space and line spacing; prefer concise equation/quantity labels and put identity
and explanation in the node title/body. Do not pack multiple sentences inside
artwork to bypass the text role.

Cue-driven motion moves the **whole artwork group**, including any text inside
it. Node title/body below the artwork remain fixed. Plan the starting, intermediate
and final bounds of moving groups, including their labels. Keep a clear collision
region and a separate quantity/accounting region; use connectors only when they
add a needed relationship, and route them clear of other labels and geometry.
A stationary label inside a moving drawing is not supported by that group's
motion. Use a separate semantic node when it needs independent motion.

Generated diagram `connections` currently draw straight center-to-center links
between artwork regions, with the relationship label at the midpoint. They do
not accept custom bend points or label offsets. A review asking to reroute such
a link requires repositioning/resizing the semantic groups, or removing a
redundant link whose relationship is already clear in the construction. Do not
promise unsupported connector routing or keep a line that cuts through another
node's caption. Keep independent group bounds and moving-art bounds clear.
