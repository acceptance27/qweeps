# Storyboard and review contract

The QWEEPS harness uses this skill's method and reference studies in three stages:
**plan the lesson → direct the animation → review the teaching**. A normal spoken
answer does not need these stages unless a new visual explanation is helpful.

A storyboard contains one learning goal, a driving question, a concrete example,
a representation choice, relevant reference IDs, assumptions, and teaching beats.
Each beat specifies:

- `id`, `question`, `insight`: the question and the distinct new understanding.
- `before`, `change`, `after`, `reasoning`: the visible explanatory transformation
  and why it warrants the conclusion.
- `retain`: semantic object IDs that must remain as anchors, when applicable.
- `camera`: what to focus on and why; staying still is allowed.
- `narration`: the explanation of the relationship, rather than rendering calls.
- `interaction`: an appropriate learner experiment or follow-up, if useful.

The current browser compiler supports circle/ellipse, box, text, arrow and line
primitives; timed drawing/writing/growing, stable-object transformations, dimming,
emphasis/signal cues and camera interpolation. Native Manim can support richer
constructions when authoring outside that compiler. The harness must surface a
capability gap rather than imply that labelled boxes are an equivalent of an
unsupported plot or simulation.

The director maps each storyboard beat to a scene beat and names the actual
`evidence` objects that make its inference visible. It must preserve the stated
anchors. The review sees both storyboard and scene, including narration,
positions, timing, connections, emphasis and camera state.

Reject a lesson when:

- Its beats repeat an insight or narrate algorithm iterations as new lessons.
- Narration makes the important claim but no visible relationship supports it.
- Motion is decorative and could be removed without losing the explanation.
- A formula or numerical conclusion is detached from the worked example.
- A transition loses the anchors needed to understand what changed.
- A branch restarts the whole topic instead of resolving the paused question.
- It invents source access or disguises an unsupported mechanism as a flowchart.

A review records what a viewer actually sees and learns in each beat, and either
approves or gives concrete revisions. Structural checks catch missing evidence,
duplicated text, lost anchors and scene/storyboard mismatches. Semantic review is
model judgment, not proof of pedagogical quality; inspect playback too.

Native plan/scene review allows one revision after an initial failure. The live
browser harness allows up to three visual revisions with actual frame feedback,
preserving reviewed facts and unflagged beats. After the configured limit, keep
the parent's scene intact and report unresolved defects. Do not substitute a
canned lesson or call an unreviewed result successful.


## Visual reasoning contract (version 2)

New plans include `visual_design`: a relationship `family` (mechanism, comparison,
grouping, quantitative, evidence, symbolic or mixed), `why` this representation helps,
`encodings` describing its spatial/visual meanings, `misreading` and its visible
`safeguard`. Each beat adds a `visual_test` appropriate to the presentation method:
inspect a geometric construction directly, but retain essential descriptions in a
historical infographic. Primary reference IDs are unchanged; supplementary IDs are
`bayes_sample`, `bayes_perspectives`, `data_reencoding`, `derived_views` and the
user-approved descriptive infographic reference `hyperframes_rizal`.

Except for actual symbolic code/equation derivations, cited evidence cannot consist
entirely of text. Symbolic is not an exception for moving prose labels. A later beat must change its
cited evidence, rather than only its heading or camera. These deterministic gates
catch actual previous failure modes; they do not prove that any non-text shape
explains anything. Semantic review must still identify the visual relationship.

Each review evidence entry adds `caption_free_answer` and `misreading_guard`.
The legacy field name `caption_free_answer` remains for compatibility; it records
what the chosen visible presentation establishes, with necessary infographic
descriptions included. It is not an instruction to remove explanatory text.
`visual_checks` contains five separate judgments with `check`, `passed` and a
concrete `observation`: `relation_visible`, `encodings`, `continuity`, `reading_load`,
`timing`. Approval requires all checks to pass, all beat evidence, and no findings.
This review sees scene data. It must not claim rendered-pixel or listening QA.

Version 1 saved lessons still load. Newly generated lessons use version 2 and
cannot silently omit visual design. Native authored examples additionally use
the successful-render receipt, timed frame inspection and actual playback; the
planner's approval is not substituted for those checks.
