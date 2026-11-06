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

## Generation goals and calculated examples

Choose the requested goal, rather than requiring a repository for every system:
Learn uses an illustrative worked example; Design proposes a system with explicit
assumptions and tradeoffs; Inspect requires supplied source and preserves its
structural evidence. Repository scans describe selected files and static imports,
not a complete call graph or runtime execution. Do not invent edges between
unconnected files. JS/TS import heuristics must remain marked inferred.

Learn contracts include `workedExample: {inputs, calculations}`. Supported operations
are normalize, mean, dot, cosine, similarities, rank, take, get, tokenize, concat and
format. Each calculation references earlier named values. The server computes
`workedExample.values`; it does not execute authored code. Bind graph nodes,
packets and nodeData entries with `valueRef`, and variable state with
`stateBeforeRefs` / `stateAfterRefs`. Review the computed results independently
and use the same facts in prose, diagrams, function modules and displayed source.
Toy vectors do not become real model embeddings because their arithmetic is checked.

Populate the actual renderer fields: vector-bars uses floats; token-tiles uses
tiles; lookup-table, funnel-pool, score-meter, podium-rank, gate-keep-drop,
blueprint-slots, heatmap-spotlight and citation-verifier use rows; paper-card,
doc-scroll and dropped-bin use lines; output-pill uses highlightText. Avoid empty
specialized cards. Keep focused groups small and inspect code-file changes,
portrait and short landscape viewports, pause, seek and rewind on the real host.
Keep the original prototype interface and reference coordinates unchanged.

For repository-generated chapters keep packets empty and variable states empty;
a source scan has no execution trace. Show real static imports and source excerpts.
For Design, a component proposal normally needs no function modules. Add one only
when the learner needs the internal inference, rather than making each storyboard
beat a redundant function. Review the card summaries as rendered: full JSON belongs
in inspection, document cards should expose IDs/text/vectors concisely, and score
bar scale must be explicit. State changes must update actual bars/tables, not just
text previews, and card bounds must accommodate later results.

When review finds a material shared-contract error, correct the shared authored
specification before revising chapters that consume it. Recompute derived values;
never patch calculated receipts directly. For similarities declare metric cosine
or dot explicitly when their distinction matters, and keep code and wording in
agreement. In generated follow mode, a broad group may become an unreadable
poster: follow its measured transfer at readable scale and retain Overview as the
explicit whole-system view. Packet labels should summarize IDs/results concisely;
full records stay available in inspection.
