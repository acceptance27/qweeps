# Architecture and code traces

The user explicitly rejected a simplified reinterpretation of the supplied architecture/code-tracing ZIP. Its original React components and interaction design are authoritative. Preserve the compound containers, nested blocks/ports/wires, full goal/input/output sidebar, specialized visual variants, minimap, resizable split, citation/evidence modal, authored questions, mini-explanation and playback/breadcrumb controls. The user subsequently replaced the entire feature with `remix-qweeps-architecture-&-code-tracing-prototype (3).zip`, including its engines and Gemini backend. The active source is `vendor/architecture-remix/`; the host is `visual-studio/src/live/architecture/remix/`. Preserve the supplied compilers, layout, data and interaction logic. Do not rebuild them in an adapter. Earlier `prototype/` code is legacy compatibility only. QWEEPS integrations belong behind those existing controls. Keep authored responses labelled and use the real provider for new learner questions.

The reference uses the ZIP's prepared coordinates and routed port geometry for fidelity. New generated graphs use automatic layout. Do not describe the reference's ELK fixed-layout verification as automatic placement. Frame review must capture the actual prototype workspace, including its HTML visual cards and source/goal sidebar.

## Legacy saved-lesson authoring format

The following authoring contract applies to older saved lessons and their review. New architecture work uses the complete imported compiler and its own bundle format; see `docs/architecture-remix.md`. Gemini uses its separate `.env`, as explicitly requested. Fixture data and claimed performance in the ZIP are not evidence of live generation or recorded execution.

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
unconnected files. Use Python AST and Babel JS/TS/TSX parsing for static imports and definitions. Bind only actual selected targets; do not substitute a folder neighbour for an unselected imported file. Lexical call matches remain inferred, not observed invocation.

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


## Compound topology and updated reference

Use the supplied version-4 prototype’s procedural frame and compound sizing for the authored reference and its seventeen prepared function lessons. Arbitrary generated subjects use bottom-up ELK child and parent layouts. They must never acquire sequential wires from child list order. Bind cross-container edges to actual `sourceChild` / `targetChild` endpoints when known; source imports remain references, not runtime data flow. Source selection must cover the requested responsibilities before alphabetical helpers. Show the bounded scan coverage and preserve disconnected files.

A shared function ID alone does not authorize replacement of a generated lesson’s code, values or timing with reference content. Restrict curated module reuse to the explicit reference render contract. Inspect actual whole-system and focused views; check containment, wall alignment, branch routes, distinct role icons and source coverage. Use the approved reference image only for composition, never to invent subject-specific structure or runtime values.


## Source-backed function inspection and review

Repository inspection must navigate folder → file → callable → selected source operations. Keep a searchable catalog for all indexed callables in the selected files, even when only a few fit the overview. Load additional modules from pinned source snapshots; never evaluate inspected files or silently read a changed live file. IDs include definition locations to distinguish repeated callback names. State scan/file/catalog limits and label selected operation views honestly: they are bounded syntactic paths, not exhaustive control-flow analysis or execution.

Imports are References / Referenced by, not runtime inputs. Shared references may share a wall port for their exact endpoint. Never draw input-to-input links or redirect unresolved/unselected targets into a group. Functions need their own actual source and operations; generic Learn/Design modules derive from the authored child connections/code, not the prepared RAG modules.

Capture representative file/function inspector frames plus the root overview and each root beat. Wait for the requested scope's completed layout before capture, including return to root. Keep both transfer endpoints visible while teaching a connection; a moving dot on an otherwise empty wire cannot establish the relationship. Verify nested inspect/back restores the parent's time, selection and camera. Preserve source limitations in narration and the inspection pane.

Generated source inspectors should open focused, not as an unreadable whole-function poster. Show declared parameters and possible source paths honestly, keep operation reading groups compact, and retain exact bounded source internally for evidence. The user has requested removal of raw Python lines from the learner interface; show input/output contracts and readable operation explanations instead. Check that highlighted branch lines remain visible after a result, and that wrapping retains the original line number rather than implying an extra statement.


## Source-backed system composition

A file/import index is evidence for authoring, not a substitute for the requested system architecture. Compose explicit named input boundaries, processing stages with real internal functions, dependencies/stores and final output boundaries. Require a directed data/control path from an input to an output and named incoming/outgoing contracts for processing stages. Static import edges alone cannot establish that path. Cite actual pinned source and mark inferred relationships honestly; do not invent observed values or external service internals. Review success, failure/revision and asynchronous response paths when supported by the requested system.

Function inspection must expose arguments, configured dependencies, returned values and outward effects. A function returning no value may still produce a response, saved artifact or updated state; distinguish those from a return. Derive interfaces from the full function body, excluding nested function returns. Keep code internally as evidence while removing raw Python/source-line panels and syntax dumps from the learner view. Use meaningful names and descriptions; a file/line number is evidence, never an output value. Match sidebar and diagram boundary contracts and preserve Inspect/Back checkpoints.

The reference input means the visible composition: external Question → square wall port on the named answer(question) enclosure → internal embed() function. It does not mean only a list of parameters in a sidebar. Keep inputs and results outside the enclosure, function stages inside, and support sources opaque and separate. Render an explicit enclosing-call marker as the frame, not a duplicate box. Arrange children, internal stages and external cards in separate layout passes; balance large systems across rows without changing their declared topology. Keep the question and destination together in the opening view. Show the complete feedback route and output distinctions at their takeaway. Use distinct role icons and preserve control/reference semantics.

Review actual entry, internal-stage and playback inspectors as well as the root overview. Supply these global interaction images to every chapter-review group. Preserve measured audio for layout-only/nested-module changes, and regenerate and align it when spoken words change.

Use the same compact enclosure/port/block grammar inside source function inspection. Group only consecutive operations and stop grouping at branches/joins; preserve original operation and edge IDs. Keep explicit boundary cards outside the function. Direction markers may illustrate declared routes on the lesson clock, but must not imply recorded execution or invent payload values. Leave references static. Keep macro stage/input/output names readable in a whole-system view; show detailed operation labels when focused.

Do not reuse an earlier image approval after the chapter content, shared architecture, inspector/overview image, or chapter frames change. Scope visual-approval caching to the actual reviewed content and images.

Use the original reference sidebar component for generated systems and inspectors too: @step goal, then a compact dark input/output inset with the same fonts, colors and spacing. Populate it from actual system ports, declared function contracts, child endpoints and the lesson's own computed values; never substitute reference facts. Keep large function catalogs, full contracts, connections and evidence collapsed below the teaching cards. Preserve reference goal text and prepared example values.

## Recorded voice in the complete remix workspace

The active supplied remix engine has its own recorded-voice integration. Keep its
procedural graph, packet timing and pure renderer intact. Build one connected
spoken explanation per open scope, using the same configured Fish narration and
local word alignment as visual lessons. Anchor existing packet send/receive and
settled-result moments to distinct exact spoken phrases; simultaneous events stay
grouped. The original gap-filler/tutor instructions are separate and unchanged.

Map the actual recording playhead monotonically onto the existing scene clock,
retaining the previous settled frame through the incoming reasoning bridge.
Render short subtitles from measured word times, including long spoken sentences.
Do not substitute a clip-duration fraction or word-count estimate for missing
alignment. A new source, graph, scope, model or voice must invalidate stale work;
caption-only revisions should reuse the original recording and word timing.

Inspect prepares that scope on demand. Cache its track separately, pause the
parent audio and restore its exact position on Back. Preserve the reference's
single-beat inspection preview and full Run playback. Test real continuous
playback across beats, arbitrary seeks, pause/resume, nested restore, preparation
cancellation, stale response suppression, browser fetch binding and rounded media
endpoints. A local media file or mocked transport alone is not playback proof.
Keep the template/source-analysis limitations explicit: voice timing does not
validate the underlying architecture's factual accuracy or establish execution.
