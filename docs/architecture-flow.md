# Architecture and code tracing

The architecture workspace uses the actual React components supplied in `qweeps-architecture-&-code-tracing-prototype.zip`. The complete component tree, compound diagrams, port wiring, minimap, goals/inputs/outputs sidebar, visual cards, evidence modal, prepared questions, mini-explanation and playback bar are retained under `visual-studio/src/live/architecture/prototype/`.

## Open the workspace

Start QWEEPS and open [How a RAG answer is assembled](http://127.0.0.1:4174/?lesson=a7c4e71f90d3426b84c719ea064bd230). The supplied reference keeps its seven beats, 58-second visual timeline and seventeen function modules. It opens directly without generating replacement narration first.

Use **Inspect Function ↘** on the compound diagram, or click an `@step` in the sidebar. **Back**, **L0** and the canvas breadcrumbs restore the saved parent view. **Overview / Fit All**, **Follow Beat**, zoom, pan and the minimap behave as in the ZIP. The divider resizes the sidebar. **Play** continues across beats; seeking and arrow-key navigation reconstruct the scene. Portrait uses the supplied Diagram/Code tabs; landscape uses the split workspace. Long sidebar content scrolls inside its bounded pane.

**Verify [refund-policy]** and the citation badge open the original prepared-document evidence view. **Ask QWEEPS** retains the prototype's authored answers and three-step mini-explanation, explicitly labelled as local prototype content. **Ask your own question · QWEEPS AI** uses the configured QWEEPS provider with the current selection, function, code and values. These are separate, honestly labelled features.

The workspace menu also connects to QWEEPS' lesson library, reinforcement quiz and narration toggle. Narration is off by default for the authored reference, matching its original presentation. Enabling it uses QWEEPS' narration transport. Generated lessons with an existing continuous recording use that measured audio playhead; prepared reference/function explanations use individual clips and proportional authored timing, which is not measured word alignment.

## New explanations

On the home screen select **Architecture & code trace**. The existing Python generation, source/factual checks, narration and review pipeline produces the shared graph/code contract. The supplied workspace components display it through `workspace.ts`. The prepared RAG example keeps its original compound geometry and routing. New graph topologies use actual layered ELK layout; layout cache keys include graph content.

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

API requests use `architectureMode: "learn" | "design" | "inspect"`. An omitted mode defaults to Inspect when `repoPath` is supplied and Learn otherwise. Inspection scans up to twelve supported Python/JS/TS files with bounded source excerpts. Python imports use AST parsing; JS/TS import edges use text heuristics and are marked inferred. Disconnected files stay disconnected. This is a source overview, not a complete call graph or runtime trace.

The example calculator supports normalization, mean pooling, dot product, cosine similarity, document scoring, stable ranking, top-k selection, key extraction, explicit toy tokenization, concatenation and simple template substitution. It never executes model-authored Python or expressions. A toy embedding or authored answer remains illustrative even when its arithmetic is computed correctly. Full calculated data is retained in `workedExample.values`; displayed card summaries can be shorter.

Generated workspaces select the source file referenced by the current beat or inspected node. Row visual variants receive actual row data, including compatibility conversion for older line-only payloads. Generated card dimensions and camera bounds adapt to their contents and the actual SVG viewport. The supplied reference keeps its original geometry and controls.

Failed architecture responses are retained as `architecture-attempt-*.json` beside preparation checkpoints. They support diagnosis and schema repair; they are not approved lessons. Publication still requires source/factual checks, narration preparation and rendered frame review.

Architecture response recovery preserves the complete response and original output budget. It does not promote a trailing node fragment to the entire contract. A bounded punctuation repair can correct mismatched delimiters outside strings before requesting model repair; it never completes truncated content at EOF or invents literal values. Complete referenced function modules accidentally placed beside `functions` can be moved into that map. Missing module content still fails validation with its function ID and missing fields.

Repository-generated chapters must keep runtime packets and variable state empty. Static source imports do not establish executed calls or measured values. Calculated cards use compact document summaries, numerical score bars with an explicit relative scale, and full values in inspection. Card sizing includes every known playback state, so a later result does not inherit an undersized input card.

Material factual corrections can now update the shared architecture before chapter revision. The repair is restricted to authored example specifications, source-line text, visual descriptions and explicit assumptions; it preserves grounding, graph identities/topology and file/line references. Calculated receipts are recomputed rather than patched. Document similarity calculations support an explicit `metric` of `cosine` (default) or `dot`, so code, labels and computed results can agree.
