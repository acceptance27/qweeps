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
