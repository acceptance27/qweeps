# Current architecture implementation

The complete supplied remix ZIP now replaces the active architecture pipeline, not just its UI. See [architecture-remix.md](architecture-remix.md) for the source, Gemini setup, persistence and workflow. The material below documents legacy saved-lesson authoring and compatibility.

# Architecture and code tracing

The architecture workspace uses the actual React components supplied in `qweeps-architecture-&-code-tracing-prototype.zip`. The complete component tree, compound diagrams, port wiring, minimap, goals/inputs/outputs sidebar, visual cards, evidence modal, prepared questions, mini-explanation and playback bar are retained under `visual-studio/src/live/architecture/prototype/`.

## Open the workspace

Start QWEEPS and open [How a RAG answer is assembled](http://127.0.0.1:4174/?lesson=a7c4e71f90d3426b84c719ea064bd230). The supplied reference keeps its seven beats, 58-second visual timeline and seventeen function modules. It opens directly without generating replacement narration first.

Use **Inspect Function ↘** on the compound diagram, or click an `@step` in the sidebar. **Back**, **L0** and the canvas breadcrumbs restore the saved parent view. **Overview / Fit All**, **Follow Beat**, zoom, pan and the minimap behave as in the ZIP. The divider resizes the sidebar. **Play** continues across beats; seeking and arrow-key navigation reconstruct the scene. Portrait uses the supplied Diagram/Code tabs; landscape uses the split workspace. Long sidebar content scrolls inside its bounded pane.

**Verify [refund-policy]** and the citation badge open the original prepared-document evidence view. **Ask QWEEPS** retains the prototype's authored answers and three-step mini-explanation, explicitly labelled as local prototype content. **Ask your own question · QWEEPS AI** uses the configured QWEEPS provider with the current selection, function, code and values. These are separate, honestly labelled features.

The workspace menu also connects to QWEEPS' lesson library, reinforcement quiz and narration toggle. Narration is off by default for the authored reference, matching its original presentation. Enabling it uses QWEEPS' narration transport. Generated lessons with an existing continuous recording use that measured audio playhead; prepared reference/function explanations use individual clips and proportional authored timing, which is not measured word alignment.

## New explanations

On the home screen select **Architecture & code trace**. The existing Python generation, source/factual checks, narration and review pipeline produces the shared graph/code contract. The supplied workspace components display it through `workspace.ts`. The prepared RAG example keeps its original compound geometry and routing. New graph topologies use actual layered ELK layout; layout cache keys include graph content. The supplied version-4 prototype supplies the reference walkthrough’s procedural sizing and frame bounds.

The preparation screen renders the same workspace used for playback. `captureWorkspace.ts` freezes computed presentation into a self-contained browser image, retaining HTML cards, the goals/output sidebar and diagram. Early, middle and finished review frames are captured from the actual renderer. Mixed lessons continue using their existing per-chapter presentation.

The code is displayed teaching material; the visualization does not execute Python or a live retrieval/model pipeline. The prepared examples and similarity scores remain illustrative. Content-only corrections retain the supplied layout: the unit vector is recalculated from the actual norm 1.8891267824, the input length is 39, and toy stopword filtering is stated. The reference's original playhead maps to the saved backend lesson scope for contextual answers and quizzes.

## Source and checks

The original ZIP is untouched. Its SHA-256 is `ec69064957bec290f7829723f10ae7edb18e340792cb8a50cbceac8aafc87a6c`. The original data modules and component implementations are copied into the repository. Integration changes are limited to QWEEPS entry points, data binding, review capture, narration, scoped typography, TypeScript compatibility and the noted content corrections. No extra prototype server or API credential is required.

Run `npm run lint`, `npm test` and `.venv/bin/python -m pytest tests/test_architecture_flow.py tests/test_visual_browser_lessons.py tests/test_visual_synchronization.py -q`. The fidelity tests cover all seventeen modules, specialized visual variants, original compound port geometry, rewind, generated-graph layout and question-clock mapping. See [browser verification notes](architecture-flow-review.md).

Use `npm run android:build` to rebuild the APK after changes. The same React workspace is bundled into the Android WebView; a successful build and responsive browser checks do not establish testing on physical hardware.

## Grounding modes and repository source

Architecture lessons declare one grounding mode:

- **illustrative** — authored worked example; values and code are not measured.
- **proposed** — a design proposal with explicit assumptions and tradeoffs.
- **source-backed** — structural nodes and edges carry file/symbol/doc evidence; runtime values still require a trace or fixture.

Every node and edge can carry `evidence` (`file`, `symbol`, `doc`, `page`, `trace`, `requirement`) and `confidence` (`exact`, `inferred`, `illustrative`). The workspace header shows the mode and opens assumptions, limitations and evidence counts. Selecting a node shows its evidence in the code pane.

### Scan a local repository

The deterministic scanner builds a source-backed graph from files, imports and definitions without inventing runtime values:

```bash
curl -s -X POST http://127.0.0.1:4174/api/visual/live/architecture/scan \
  -H 'Content-Type: application/json' \
  -d '{"path":"/path/to/repository","maxFiles":12}' > architecture.json
```

The same scan is available to lesson generation by setting `repoPath` with `presentation: "architecture_flow"`. Selected source files become graph nodes, local imports become edges, and every node/edge records file and line evidence. Unresolved imports and runtime state remain explicit limitations. Build, cache and test directories are excluded.

## Learn, Design and Inspect

The **Goal** selector appears after choosing Architecture & code trace:

- **Learn** explains a topic through one illustrative worked example. No repository is needed. A shared `workedExample` supplies inputs and a bounded list of calculations; QWEEPS computes supported operations and binds their results into cards, packets and before/after state through `valueRef`, `stateBeforeRefs` and `stateAfterRefs`.
- **Design** proposes a system from the learner's requirements. The contract must declare proposed grounding, assumptions and tradeoffs. Capacity and latency estimates remain assumptions unless supplied measurements support them.
- **Inspect** requires a source document or local repository. Repository generation scans the source before planning, includes its snapshot in the cache key, and reuses its evidence-backed graph. A changed source snapshot produces a different lesson cache key.

API requests use `architectureMode: "learn" | "design" | "inspect"`. An omitted mode defaults to Inspect when `repoPath` is supplied and Learn otherwise. Inspection scans up to twelve supported Python/JS/TS files with bounded source excerpts. Python uses its AST; JS/TS/TSX uses `@babel/parser` through Node.js. Imports resolve only to actual selected target files; an unselected target is never substituted with another file in its folder. Disconnected files stay disconnected. This is a source overview, not a complete call graph or runtime trace.

The example calculator supports normalization, mean pooling, dot product, cosine similarity, document scoring, stable ranking, top-k selection, key extraction, explicit toy tokenization, concatenation and simple template substitution. It never executes model-authored Python or expressions. A toy embedding or authored answer remains illustrative even when its arithmetic is computed correctly. Full calculated data is retained in `workedExample.values`; displayed card summaries can be shorter.

Generated workspaces select the source file referenced by the current beat or inspected node. Row visual variants receive actual row data, including compatibility conversion for older line-only payloads. Generated card dimensions and camera bounds adapt to their contents and the actual SVG viewport. The supplied reference keeps its original geometry and controls.

Failed architecture responses are retained as `architecture-attempt-*.json` beside preparation checkpoints. They support diagnosis and schema repair; they are not approved lessons. Publication still requires source/factual checks, narration preparation and rendered frame review.

Architecture response recovery preserves the complete response and original output budget. It does not promote a trailing node fragment to the entire contract. A bounded punctuation repair can correct mismatched delimiters outside strings before requesting model repair; it never invents literal values or completes an incomplete source/example/graph. If truncation occurs only inside the final optional `functions` map after the complete root fields, those complete fields can be recovered and inspection modules rebuilt from the displayed source/operations; the original response is retained. Complete referenced function modules accidentally placed beside `functions` can be moved into that map. Missing module content still fails validation with its function ID and missing fields.

Repository-generated chapters must keep runtime packets and variable state empty. Static source imports do not establish executed calls or measured values. Calculated cards use compact document summaries, numerical score bars with an explicit relative scale, and full values in inspection. Card sizing includes every known playback state, so a later result does not inherit an undersized input card.

Material factual corrections can now update the shared architecture before chapter revision. The repair is restricted to authored example specifications, source-line text, visual descriptions and explicit assumptions; it preserves grounding, graph identities/topology and file/line references. Calculated receipts are recomputed rather than patched. Document similarity calculations support an explicit `metric` of `cosine` (default) or `dot`, so code, labels and computed results can agree.

## Hierarchical containers

A function node may declare `children`: compact internal operations with stable IDs, labels, descriptions, icons, colors and optional values. Children are the canonical internal structure; do not duplicate them as top-level graph nodes. The generic compound renderer draws the parent boundary, child operation blocks, internal wires and boundary ports from this hierarchy. The authored RAG reference keeps its supplied compound geometry as a compatibility fixture while generated subjects use the generic path.

Generated hierarchies are laid out from the bottom up: ELK routes the declared child connections, parent bounds are calculated from the result, and ELK then arranges and routes the parent graph. The reference walkthrough uses the version-4 prototype’s procedural layout instead.

### Ports, internal connections and recursive layout

Function containers may declare `ports` (`inputs`/`outputs`) and `connections` between child operation IDs. The generic renderer draws boundary ports at declared positions and routes internal wires from those connections. A missing connection declaration means no internal wire; array order never establishes a dependency. Cross-container edges can name `sourceChild` and `targetChild` so their wall connections reach the actual child file or operation.

Generated hierarchy uses a bottom-up ELK layouts, with orthogonal routes and explicit wall ports. Child boxes and wire routes remain local to their parent; internal packet routes are also exposed in world coordinates. The layout cache includes full graph content. Initial paint uses a cycle-safe temporary arrangement until ELK finishes. Generated layouts expose measured containment, overlap and missing-route issues to the publication review.

Repository scans with at least two source groups emit function containers with child files and internal import connections. A single-group scan stays flat rather than inventing container boundaries.

### Internal operation playback

A flow step may declare `focusOperations` (child operation IDs) and target `activeEdges`/packets at internal connection IDs. Internal connections become routed layout segments, packets move through them, and matching child operations receive a highlighted border. This lets a beat explain a specific operation inside a container rather than only the enclosing card.


### Source selection and reference fidelity

Inspect indexes up to 10,000 supported source files, with a 2 MB per-file limit, then selects up to 12 source excerpts using the request’s responsibilities, filename/symbol relevance and browser/Python role coverage. This is a bounded static view, not a complete execution graph. Excerpts preserve real line numbers and include relevant definitions beyond the first 60 lines. Package groups contain at most eight selected files. Icons describe source roles; independent files stay independent, with no fallback chain. Old `connect-N` / `source dependency` placeholders from the previous scanner are omitted when displaying those legacy repository graphs.

The version-4 reference layout is maintained in `prototype/layout/referenceLayout.ts`; the dispatcher in `elkLayout.ts` keeps it separate from arbitrary generated graphs. All seventeen reference functions use their prepared dark function/static cards and specialized inner flowcharts. An explicit `renderContract: reference` is required before replacing generated function content with the reference lesson. A coincidental function ID must not replace authored code, timings or example values.

The system enclosure comes from the actual layout bounds, including reference function helpers and the compact rejected-document branch. Generated source children can be selected to inspect their real file. Captions use the currently spoken sentence; the complete beat transcript remains in the details pane.

Architecture publication captures an additional whole-system overview and supplies the approved reference screenshot as a composition reference to image review. Review must check unsupported wires, enclosure overflow, role icons, source coverage and readable focus as well as text clipping. The reference image supplies visual grammar, never facts for a different subject.


## Generated function inspection

Source inspection now follows folder → file → function/method → selected source operations. Prepared file diagrams show a small selection of functions; **Functions in this file** searches every catalogued callable in that selected file. Additional bodies load through `POST /api/visual/live/inspect-function` using `lessonId` and `functionId`. The server parses the lesson's pinned `source-snapshots.json`, never executes inspected code, and caches validated modules under `inspected-functions/`. Unknown IDs and arbitrary paths are rejected. Symbol identity includes its definition line, distinguishing same-name callbacks in separate blocks. Old lessons without snapshots need regeneration for this feature.

Coverage remains bounded: twelve selected files, up to 2,048 catalog entries, and at most 48 initially prepared modules. A function view displays selected syntactic operations (up to 30 operation nodes plus boundary cards), possible branches and declared outcomes, not an exhaustive control-flow analysis or runtime trace. Exact bounded source remains internal evidence; longer bodies and dynamic calls require further inspection. Source arrows mean **References / Referenced by**. Shared imports use one port per actual target endpoint; unrelated imports never become anonymous inputs to a folder.

Learn/Design function containers derive inspection modules from their declared child operations, connections and displayed code. A local Python function with a real code reference can also produce a source operation inspector. This keeps novel subjects tied to their own authored specification; a shared name never substitutes RAG fixture data. Input/store/output context nodes do not become functions merely because they reference a function's source line.

Publication review includes actual early/finished frames from representative function inspectors as well as each root beat and a whole-system overview. Capture waits for the correct scope's layout to finish. Generated packet follow keeps both transfer endpoints visible instead of following an isolated moving dot. Parent navigation retains playhead, selection and camera; inspecting or asking about a callable uses its pinned lesson source.

Generated source inspectors open in Follow Beat at readable scale. Function boundary cards list declared inputs and outcomes; operation cards describe possible paths rather than presenting source declarations as observed runtime values. New source modules split long operation lists into compact reading groups. Python source extraction uses cached UTF-8 byte offsets, preserving real AST locations without repeatedly scanning the whole file.


## System boundaries and learner-facing interfaces

Repository generation now uses the file/import graph as an evidence index, then composes a source-backed **system** view. Named inputs and outputs surround the processing stages; relationships carry source citations and distinguish declared data/control contracts from static references. Every processing stage needs an incoming and outgoing contract; a reference-only map cannot satisfy the required input-to-output path. Supporting services remain opaque when their internals are not part of the source. The file index is retained for function lookup rather than presented as the completed system architecture.

The learner details pane shows function inputs, returned results, and outward effects. Python AST extraction reads the complete callable body and distinguishes caller arguments, bound dependencies, return values, yielded values, and writes/state changes; nested function returns do not become the enclosing function's outputs. Babel supplies JavaScript/TypeScript return and effect metadata. Function diagrams have explicit input and outcome cards. Named interface contracts are not sampled runtime values. Plain-language annotations may explain known fields but cannot invent parameters or outputs.

The raw Python/source-line pane is removed from the workspace. Exact source excerpts stay in the saved lesson for evidence, validation and contextual answers. Generated operation details use teaching descriptions; source line numbers no longer stand in for operation outputs. The prepared RAG reference retains its authored goal/input/output presentation. Existing saved folder maps remain old source maps; generate a new system lesson for the fuller architecture.

The reference input is a canvas relationship: external Question → square port on the named system enclosure → internal function such as embed(), followed by a result outside the opposite wall. A virtual enclosing-call node becomes the frame, rather than a duplicate processing box. Generic system layouts place function interiors first, wrap the internal stages, then place external cards around that enclosure. Opening focus retains the question and destination together; review-loop and output-comparison takeaways retain the relevant endpoints. Control wires use a distinct dash pattern. Explicit reference layouts retain their curated geometry.

Rendered review samples actual entry, internal and playback function scopes. Every review group receives the root overview and inspector images as shared interaction evidence; later chapters must not infer that Inspect is missing because its sample was assigned to the first chapter. Layout-only or nested-module edits do not invalidate unchanged root audio; spoken-text changes require a new measured recording.

Source function inspectors use the same blueprint grammar. A presentation projection groups up to three consecutive source operations, stopping at branches and joins, into compact containers. It preserves every original operation and connection ID, routes cross-group links to the actual child ports, and leaves the source evidence unchanged. Inputs and outcomes stay outside the function enclosure. Branches and joins remain explicit instead of becoming one long horizontal train. Clock-driven direction markers follow declared control/data connections without inventing executed payloads; references remain static. Full Blueprint expands to the available width and uses readable stage labels, while Follow Beat restores operation details.

Visual approval reuse requires matching per-chapter content, shared architecture, scoped/overview images and actual chapter-frame hashes. A previous approval from a resumed revision cannot approve changed narration or a changed renderer without fresh image review.

Generated and reference sidebars now share `GoalOutputCards`: an @step goal above one dark inset with blue input and green output rows. Generated cards use the active system ports, source function interfaces, actual child connections and their own calculated ledger. The virtual system-call marker is not repeated as a sidebar card. Source dependencies and returned values/effects remain distinct in compact summaries; the full function contract, connections, evidence, transcript and searchable function catalog stay available in collapsed sections. Clicking a generated function card opens its actual inspector. Reference goal wording and prepared values are retained.
