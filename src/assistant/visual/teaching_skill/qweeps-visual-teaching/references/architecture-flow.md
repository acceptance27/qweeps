# Architecture and code traces

The user explicitly rejected a simplified reinterpretation of the supplied architecture/code-tracing ZIP. Its original React components and interaction design are authoritative. Preserve the compound containers, nested blocks/ports/wires, full goal/input/output sidebar, specialized visual variants, minimap, resizable split, citation/evidence modal, authored questions, mini-explanation and playback/breadcrumb controls. Use `visual-studio/src/live/architecture/prototype/`; do not recreate a reduced UI. QWEEPS integrations belong behind those existing controls. Keep authored responses labelled and use the real provider for new learner questions.

The reference uses the ZIP's prepared coordinates and routed port geometry for fidelity. New generated graphs use automatic layout. Do not describe the reference's ELK fixed-layout verification as automatic placement. Frame review must capture the actual prototype workspace, including its HTML visual cards and source/goal sidebar.

Use `teaching: architecture` with `layout: architecture_flow` when the learner
needs to follow a component boundary, function call, data transfer or code/state
change. Mechanism, algorithm and procedure methods can also use this renderer.
The one shared graph lives in `lesson.architecture`; chapters reference its IDs
through `visual.flow`. For generated topologies, ELK computes geometry and routed edges. Do not author node
coordinates or label a fixed-position diagram as automatic layout.

Plan a concrete input, operation, result and the inference supported by that
change. Keep topology and visual identities stable between beats. The graph and
displayed code must agree about data/control relationships. Name real file and
line references. A displayed code trace is not a code runner: identify authored
examples and prepared values, and never claim that QWEEPS executed the snippets.
If actual source is supplied, distinguish it from illustrative runtime values.

Architecture data can include prepared function modules and further inner-function
modules. A drill-down is ordinary lesson playback with a parent checkpoint. Keep
the same source example and return to the exact parent's playhead, camera,
selection and audio offset. Reject dangling or cyclic function navigation.
An architecture graph itself may contain cycles (for example a retry or feedback
path); that is different from infinitely recursive lesson navigation.

Attach exact spoken phrases to visible nodes and to each packet's semantic ID.
Packets, camera transitions, code highlights and before/after state must derive
from the measured lesson playhead. Keep the previous diagram through its incoming
reasoning bridge. Check forward seek, arbitrary rewind, pause and repeated seeks.
Layout caches include topology and node content, not just a graph name.

Review actual browser SVG frames, including the rendered source pane. Capture an
intermediate state for each architecture beat. Check diagram/code consistency,
edge labels, reading time, pixel contrast, clipping and mobile tab behavior.
Do not treat attractive layout, a moving dot, or valid graph references as proof
that a visible mechanism teaches the intended inference.

Observed reference issues to prevent: a vector described as unit length must
actually have norm one (allow stated display rounding); displayed mean pooling
must equal the componentwise mean of its shown inputs; removing words requires
an explicit filtering rule; similarity scores need provided inputs/calculation
or an illustrative-fixture label. Validate these quantities independently.
Keep full source and values accessible through inspection instead of shrinking
them into unreadable cards. Use readable focus by default and an explicit whole
graph overview. The Android browser route uses the same SVG renderer and bundled
layout engine, with code/diagram tabs on narrow portrait screens.
