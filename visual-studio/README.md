# QWEEPS Visual Learning Studio

An interactive visual learning interface for QWEEPS. The default player combines
live AI questions, a seekable visual explanation, selection/experiments, and
checkpointed branches. The production lesson displays actual GPU-rendered ManimGL frames with interactive
selection, camera controls and parameter branches. Existing generated primitive
diagrams use SVG/Canvas; Manim CE also exports them to video.

## Run

```bash
cd ~/Work/omarchy-assistant
npm --prefix visual-studio ci
npm --prefix visual-studio run build
omarchy-assistant visual astar
omarchy-assistant visual "Explain how an ALU works"
```

The launcher starts the local studio/model host at
[http://127.0.0.1:4174](http://127.0.0.1:4174). It reuses QWEEPS' configured LLM and
TTS. No provider API key is stored in this browser app.

For development, run `omarchy-assistant visual serve` and `npm run dev` in separate
terminals. The Vite dev/preview proxy forwards `/api`, `/narration` and `/renders` to port 4174.

## Interaction

- Play/pause: Space. Step back/forward: ← / →. Scrub with the progress slider.
- Click a cell/object, or drag over a region, then ask about it in the chat.
- In A*, drag S/G to recompute the real search. Four-way movement, unit costs,
  fixed walls and Manhattan h are explicit. Cyan cells are the open frontier;
  muted cells are expanded; green shows the final shortest path.
- Generated diagrams support dragging objects, right-drag panning and wheel zoom.
  Moving diagram shapes edits layout; it does not simulate arbitrary subjects.
- Branch asks for a new visual detail. Return restores the exact parent time,
  camera, selection and edits. Branches may nest.
- New lesson generates a fresh topic. Paste relevant code/excerpts in Source
  context when asking about your own project.
- `/` focuses chat; Enter sends, Shift+Enter adds a line. Esc closes the desktop
  app window, or ends the session in browsers that block scripted window closes.
- Dictation uses browser SpeechRecognition when supported. Voice narration uses
  QWEEPS TTS with a 1.5-second reveal pause and waits for speech to complete.

## Generated scenes and Manim

The model returns an answer and optional JSON scene, rather than arbitrary code.
The backend validates up to 8 complete beat snapshots with semantic elements,
connections, camera and narration. The player renders them interactively; a
fixed compiler exports the same data as a Manim CE `MovingCameraScene`.

Use **Manim source** or **Render Manim video** on generated lessons. MP4 renders
are visual-only; speech remains in the interactive session. Install Manim CE in
`~/.local/share/omarchy-assistant/manim-ce`, or set `QWEEPS_MANIM_PYTHON`, as described
in the assistant's [visual learning guide](../docs/visual-learning.md).

The current generated vocabulary is boxes, ellipses, text, arrows and lines.
This is a first interactive teaching harness, not automatic production of
arbitrary 3D scenes or hand-authored 3Blue1Brown films. It has no automatic web
research or repository retrieval. Sessions and branches currently live in memory.

## Legacy studio

`?mode=studio&scene=astar_heuristic` opens the original Canvas inspection and
source examples. Other built-in examples include `neural_net`, `fourier`,
`linear_transform`, `riemann_calculus` and `chapter2_pdf`. These are fixed
examples, not evidence that an uploaded document has been read.

## Structure

- `src/learning/LearningPlayer.tsx`: conversation, playback, narration, checkpoints.
- `src/learning/GridCanvas.tsx`, `astar.ts`: actual inspectable A* trace.
- `src/learning/PlanCanvas.tsx`: interactive validated-plan diagrams.
- `src/components/ManimCanvas.tsx`: existing Canvas examples.
- `src/scenes/sceneData.ts`: legacy scene metadata and source examples.
- `../src/assistant/visual/`: model bridge, validation, server,
  deterministic Manim compiler, desktop lifecycle and optional MCP facade.

## Verify

```bash
npm run lint
npm test
npm run build
```

The A* tests compare path length with an independent breadth-first-search oracle,
check queue decisions, and verify that seeking reconstructs immutable snapshots.
The assistant tests validate model context, malformed-plan rejection, API origin
checks, command isolation and desktop close targeting.

## Five teaching-method examples

Open [the narrated examples gallery](http://127.0.0.1:4174/?examples=1): Python names, a one-bit ALU, toy world-generation controls, US entry into WWI, and seasons. Each uses a different visual argument, with chapter seeking, a prediction question, sources and teaching-design notes. See [the example source and rebuild instructions](examples/teaching-methods/README.md).

## Interactive production measurement

Open [the native production lesson](http://127.0.0.1:4174/?scene=manim_production&paused=1).
Its six chapters distinguish playback/production clocks, overlapping job bounds,
frame work, token-to-dollar re-encoding, avoidable repeated work and time/cost tradeoffs.
Select geometry or drag a region, ask a question, change parameters, and return
from a focused question branch to the saved parent. Right-drag pans; wheel zooms.
Fish narration retains its cached clip and playhead across pause/resume.

Native runtime: `~/.local/share/omarchy-assistant/visual-venv/bin/python` with
ManimGL and working OpenGL, or set `QWEEPS_MANIMGL_PYTHON`. No generated Python is
executed: the model chooses reviewed representations and bounded parameters.
The numeric report is a frozen snapshot of prior work; dollar values are
hypothetical GPT-6.1 Sol token costs, not an invoice or an official Go tariff.
