# QWEEPS visual teaching work

For visual lesson or teaching-harness changes, read
`teaching_skill/qweeps-visual-teaching/SKILL.md` and its relevant references before
choosing a representation. Python, ALU, and world-generation examples were accepted
by the user; the infographic weakness was narration doing the teaching while labels
moved. Address visual reasoning, not just wording or factual completeness.

Keep the installed skill and runtime harness on the same maintained material.
New generation must pass version-2 visual-design and caption-free review; retain
compatibility with saved version-1 lessons. Treat scene-data review separately
from rendered/playback QA. Do not claim live generation worked if provider access
failed or use canned responses to disguise that failure.

Run the relevant visual tests after a harness change. For native examples, use
the frame-review workflow and observed-failure notes in the skill. Preserve accepted
examples unless the user requests changes or a concrete defect requires one.

The user now prefers live browser scenes with no baking. Read the skill's
`references/live-browser.md` for SVG/GSAP delivery. If native Manim is specifically
requested, use actual native frames and name the active renderer honestly.
Check transitions, arbitrary rewind,
selection and parameter changes. Fish playback must retain its clip/playhead on
pause and prevent late audio after cancellation. Verify these on the real host.

For history or geographic teaching, compare the actual rendered scene with the
accepted WWI and primary reference lessons before approval. Verify recognizable
locations, named actor roles, visual meaning without narration, and continuity
through changes; record failed frames and improvements. A working renderer or a
plausible storyboard alone does not establish visual quality. For follow-up
questions, use relevant available sources beyond on-screen labels and identify
what evidence was retrieved.

The user approved the supplied HyperFrames Rizal storyboard and its descriptions.
Read the shared skill's `references/assets-and-strokes.md`. Asset reuse, sufficient
descriptions and measured stroke construction are authoring priorities. A
caption-free diagnostic must not become a ban on useful explanatory text.
