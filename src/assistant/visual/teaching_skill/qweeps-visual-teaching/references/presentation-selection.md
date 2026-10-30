# Choose a presentation method

Begin with what the learner needs to understand or do, their familiarity and the
available evidence. Topic labels are clues, not a dispatch table that forces one
template. For example, history may need a quantitative chart; mathematics may
need a concrete analogy before a derivation. Select and combine methods as needed.

| Learner's difficulty | Suitable starting approaches | What makes it teach |
|---|---|---|
| Why a mathematical or geometric result follows | 3Blue1Brown-style construction, matching transforms, linked equations and geometric quantities | The changing construction substantiates each step; notation keeps its meaning. |
| Who, where, what happened and why it matters | Descriptive infographic, illustrated chronological account, geographic orientation, comparison or evidence dossier | Names, dates, definitions and short explanations accompany the objects; staged motion directs the reading. The supplied HyperFrames Rizal reference is useful here. |
| How a mechanism or system works | Cutaway, exploded view, signal/material flow, state transition, interactive simulation | Parts are recognizable and the learner can track a particular input to its consequence. |
| How code or an algorithm behaves | Worked execution, variable/memory view, graph search, input-output experiment | Show the actual changing state; distinguish an execution step from a new teaching idea. Python, ALU and world generation are accepted references. |
| How quantities compare or change | Data-bound chart, distribution, map or coordinated views | Define quantities, scale and uncertainty; use actual supplied or retrieved values. |
| How categories, choices or unfamiliar ideas relate | Concrete cases, sorting, aligned comparison, before/after or a carefully bounded analogy | Define the terms and make the comparison criterion explicit. Don't manufacture numerical causal weights. |
| How to perform a practical task | Annotated demonstration, real interface/source view, guided steps with a visible result | The learner can reproduce the action and recognize success. |
| How to remember or retrieve names, order or rules | Stable spatial route/method of loci, visual or keyword mnemonic, paired verbal hooks and imagery | The cue has a stated meaning and a recall opportunity; factual explanations remain available. |

Choose at the beat level. Begin with the previous result, the remaining learner
question and the evidence available to answer it. Record shared encodings and
the reasoning chain in `representation`; this is not one layout to repeat.
Each new live beat declares:

```json
{"presentation":{"method":"Geometric construction","why":"Show why opposing momenta cancel while energy adds.","visualEvidence":"Equal arrows meet; their resultant shrinks to zero while an energy total remains.","textMode":"labels"}}
```

`method` is a specific free-form approach, not a closed subject-to-style table.
`why` explains the fit to this inference; `visualEvidence` identifies the actual
observable change and what the learner can infer. `textMode: labels` requires the
live `diagram` layout: use geometry, short labels/equations and a concise takeaway
(at most 120 characters). Object `body` explanations remain available through
selection/Details and Q&A, not as paragraphs on the construction. Do not hide
paragraphs in artwork text or use labels mode merely to suppress necessary context.
`textMode: descriptive` retains visible definitions, identities and descriptions;
it can use any supported layout, including an annotated diagram.

For example, one lesson can construct an energy-momentum relationship, test it
with a counterexample, then use an annotated experimental diagram to explain
the evidence. Change the method when the question calls for it. Consecutive beats
may continue the same construction; do not impose a diversity quota. Preserve
object identities, color meanings and motivating spoken bridges across changes.
Choose specific reference techniques that serve the question rather than listing
reference names. The director carries these choices into each beat. Frame review
records `methodFits`, `evidenceVisible`, `textSupports` and a concrete observation
for every declared presentation. Approval requires all three judgments to pass.
Inspect early, intermediate and finished diagram states, then rewind and inspect
selection; a good method declaration does not prove it was executed.

Understanding and recall are different goals. Combine a fitting explanation with
memory cues when useful; do not force loci, bizarre imagery or kinetic motion onto
every topic. Dual coding pairs useful words and imagery rather than banning text.
For mnemonic work read `memory-and-motion.md`; never promise a fixed recall gain.

Text density follows the job. A derivation may be mostly geometry and equations;
a historical dossier may need multiple descriptive sentences. Use readable
hierarchy and sufficient reading time. Do not reward unexplained minimalism or
replace a useful explanation with an icon. Also avoid a wall of disconnected
facts: group descriptions by what the viewer is looking at and reveal them in a
logical order.

Review in two ways: does the visible change support the intended relationship,
and can an unfamiliar viewer understand the complete presentation? A
caption-free diagnostic is helpful for a geometric proof or mechanism. For an
infographic, retain its essential names, definitions and descriptions when
judging comprehension. Reject decorative motion, not useful text.
