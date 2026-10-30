---
name: qweeps-visual-teaching
description: Design and review QWEEPS animated explanations by choosing presentation methods that fit the learning goal. Use for visual teaching, descriptive infographics, mathematical animation, lesson progression, and live or Manim teaching review.
---

# QWEEPS visual teaching

Choose the presentation method for the learner's question. Do not impose one
reference's aesthetic, text density or animation grammar on every subject. Read
[presentation selection](references/presentation-selection.md) before planning;
record shared anchors and the reasoning chain in `representation`, and choose a
`presentation` for each beat: `method`, `why`, `visualEvidence`, and `textMode`.
Make the choice from that beat's question, prior understanding and evidence.
Use `labels` for a geometry-led diagram and `descriptive` when useful prose
belongs beside the objects. Neither is a lesson-wide preset or a variety quota.
Combine approaches where the learning goal benefits, and change approach when a
different relationship needs explaining. 3Blue1Brown is especially useful for
mathematical and geometric reasoning, not a universal presentation requirement.
When remembering or retrieving information is part of the goal, also read
[memory cues and kinetic explanation](references/memory-and-motion.md). Spatial
mnemonics, dual coding and visual hooks are optional tools to combine with a
fitting presentation, not a new template for every lesson.

Make the presentation carry the reasoning. The user's primary reference set is
**PDF Explainer**, **Math 01: Neural Net & Loss Curve**, and **A* Pathfinding &
Heuristics**. Use their teaching decisions, rather than copying their subject
matter or treating black backgrounds, smooth motion, or a number of beats as
the method. Do not redesign the grid-search demo as a substitute for this task.

Read [lesson continuity](references/lesson-continuity.md) for multi-beat lessons.
Each transition must connect the preceding result to a remaining question and
explain why the next beat helps. Put that connection in the actual narration and
visible bridge; a shared example or a single audio recording cannot establish
the reasoning chain by itself. Review the full sequence before approval.

Read [the teaching method](references/method.md). Read the relevant entries in
[the three reference studies](references/examples.md) to choose a representation
and progression. The user additionally approved the Rizal storyboard, descriptions
and stroke development in `HyperFramesRizalStudio.tsx` from the supplied
`nitrogenkinetic_…benchmark.zip`. Its chapter structure may be adapted or copied;
its hand-drawn maps and unverified historical details are not authoritative.
For infographic or abstract-subject work, read [visual reasoning](references/visual-reasoning.md)
and the [3Blue1Brown method studies](references/3b1b-studies.md). The user authorized
these supplementary studies; they do not replace the three primary references.

For a new lesson, write a storyboard before animation code/data. Each beat must
answer a learner question with a **new inference made visible by a change in the
scene**. Specify the visual grammar, its encodings, and a likely wrong reading.
A mathematical construction or mechanism should expose its relationship in the
geometry or state. An infographic can explain through descriptions and motion
graphics together; it must identify unfamiliar entities and explain their relevance.
Moving a label alone is not a new inference. Describe what exists before, what changes, what the learner sees after,
and why that change answers the question. Algorithm iterations are animation
steps inside a beat unless an iteration teaches a distinct idea. Rewording the
same explanation over successive nodes does not create new teaching beats.

Keep recognizable visual anchors across reasoning steps. A camera move should
follow the reasoning: focus on a mechanism, compare two states, or navigate a
persistent spatial blackboard. Use a different structure when the subject calls
for it; do not force every lesson into A*'s sequence or into a circuit diagram.

When implementing, read [the rendering repertoire](references/rendering-repertoire.md)
when richer geometry, SVGs or other assets are useful. SVG and compatible
assets are the preferred starting point for recognizable objects, not a last resort.
Read [assets, descriptions and stroke development](references/assets-and-strokes.md)
when authoring or reviewing infographics. Useful descriptions belong in the visual:
identify people and places, define unfamiliar terms, and explain why a detail matters.
Do not interpret visual reasoning or caption-free review as a ban on explanatory text.
The user now prefers live browser animation with
no baking. For that delivery, read [live browser lessons](references/live-browser.md)
and use a seekable SVG/GSAP or other suitable browser scene. Preserve the teaching
method and visual richness; do not restrict new lessons to a few generic primitives.
When native Manim is specifically requested, use actual native frames and name the
runtime honestly. A browser recreation is not an embedded Manim runtime.
Inspect the renderer's actual capabilities. Prefer the
existing authored scene engine for a matching reference lesson. For new subjects,
compile the storyboard into supported geometry and timed actions, or use native
Manim when richer geometry is available. Do not flatten an unsupported mechanism
into generic labelled boxes and call it an equivalent teaching animation.

Use [the storyboard contract and review rubric](references/contract.md) when
working with the QWEEPS harness. Review the resulting scene against the storyboard,
then inspect playback or rendered frames. Compare the actual visual execution against
the user-approved references, not merely the proposed inference. Check whether
places are recognizable and whether each actor can be identified without guessing.
Record defects and revisions before approval; passing a schema or reporting what
a shape was intended to mean does not establish visual quality. For native authoring and delivery, read
[observed failures and prevention](references/failure-prevention.md); use the
frame-review script before publishing a changed scene. A schema passing does not establish
that a lesson teaches well. Use concrete feedback for revisions and preserve
reviewed facts and unflagged beats. The live browser harness allows up to three
visual revisions; after that, preserve the current published lesson and report
the unresolved defects. Native plan/scene review retains its single revision.

Questions about a paused lesson must retain the current scene, selected objects,
camera, time and recent discussion. A branch should resolve that particular
confusion using the established visual language, then return to its saved parent.
Keep straightforward spoken answers straightforward when no new visual is needed.
Question answers must not be artificially confined to facts drawn in the scene:
consult appropriate available sources or project context and provide attribution;
if retrieval fails, state the limitation rather than inventing evidence.

Reference facts, example percentages and PDF page labels are not evidence for a
new subject. Use supplied source/code/data for project-specific claims; state
assumptions and source gaps. Preserve the caller's requested product and scope.
