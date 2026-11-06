# Architecture and code tracing

QWEEPS includes the architecture/code-tracing experience adapted from the supplied Google AI Studio prototype. It uses QWEEPS' green and gold theme, lesson library, narration transport, quizzes and contextual questions.

## Try it

Open [How a RAG answer is assembled](http://127.0.0.1:4174/?lesson=a7c4e71f90d3426b84c719ea064bd230) after starting QWEEPS. The authored example includes seven main beats and seventeen function modules. Gold code lines and **Enter function** open prepared reasoning steps. **Return** restores the parent's time, view and selection.

On the home screen choose **Architecture & code trace** under Presentation to generate a new explanation. Supply the relevant code or describe the system and a concrete input. This is a browser presentation and cannot be combined with native Manim. Automatic presentation selection remains available for other subjects.

## Interaction and layout

- Code and diagram share the same lesson playhead. Highlighted source lines, before/after values and traveling data packets reconstruct when seeking or rewinding.
- Inspect a component for its complete data, code reference and connections. **Ask QWEEPS** opens the existing question composer with that selection; replies use the configured provider.
- Gold function lines open prepared modules. Other mapped code lines seek to the corresponding beat.
- The diagram follows the explanation. Drag empty space to pan, use the zoom controls, or choose the compass for the entire graph. The focus control resumes following.
- Narrow portrait screens use **Diagram / Code** tabs. Short landscape screens retain the split view. The lesson page fits the viewport; long inspector contents scroll within the inspector.
- The normal playback controls, keyboard navigation, reinforcement quiz and branch mini-lessons remain available.

## Runtime and authoring

`architecture_flow.py` validates a shared, coordinate-free graph, source excerpts, prepared functions and per-beat transfers/state. Nodes and packets have stable semantic IDs; edges declare data, control, lookup or reference relationships. Code references must identify displayed lines. ELK computes layered, routed geometry; the cache includes topology and content rather than only a graph ID. Its bundle loads only for architecture lessons.

New generation builds the shared graph/code contract before directing each beat. The existing source, factual, narrative and rendered review pipeline also receives graph/code context. The preparation view captures actual SVG frames at early, intermediate and finished states, including the source pane. Continuous narration maps packet IDs to exact spoken phrases and measured word times; the renderer uses the same audio playhead. Prepared function modules use the existing per-chapter narration transport, with authored timing until measured cues are supplied.

This is an educational visualization, not a Python sandbox, debugger, repository indexer or real database/model executor. Displayed source and illustrative runtime values must be identified honestly. The RAG example uses prepared vectors, retrieval scores and generated text. The prototype's incorrect normalization was corrected; its toy stopword rules are explicit. Similarity scores remain illustrative because their document vectors were not supplied. Real model generation still depends on configured providers and review and may take several minutes.

The renderer runs in the same web interface on Windows/Linux and the Android WebView. A responsive browser check does not establish testing on a physical Android device. After source changes, rebuild the APK with `npm run android:build`; desktop development uses `npm run dev`.

## Checks

`npm run lint`, `npm test`, and `.venv/bin/python -m pytest tests/ -q` cover the frontend and Python suite. Architecture checks include graph/reference validation, real ELK node separation and cycle routing, changed-topology cache invalidation, measured packet timing, deterministic rewind, nested scope context, and atomic publication of synchronized saved lessons.

The original reference ZIP remains untouched. `bench/convert_architecture_reference.py` reproduces the adaptation from its exported data; it does not execute uploaded application code. ELK's EPL-2.0 license and notices are included in the distributed app.
