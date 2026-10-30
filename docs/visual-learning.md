# QWEEPS visual learning

The default visual interface is an interactive browser scene connected to the
QWEEPS model, not a collection of canned answers. The local host serves the
compiled studio and its API on `http://127.0.0.1:4174`.

## Visual model selection

Conversation/orchestration and ordinary spoken-response text default to Nemotron
3.5 Super VL through OpenRouter. Lessons use Antigravity Gemini 3.8 Flash High for
planning, scene generation, factual/narrative/image review, and lesson narration
writing. Speech synthesis retains its separately configured Fish model and voice:

```toml
base_url = "https://openrouter.ai/api/v1"
auth_provider = "openrouter"
api_key_env = "OPENROUTER_API_KEY"
model = "nvidia/nemotron-3.5-super-vl:free"
fallback_models = []
fallback_provider = "offline"
visual_provider = "antigravity"
visual_model = "gemini-3.8-flash-high"
visual_vision_model = "gemini-3.8-flash-high"
```

These explicit visual settings take precedence over the legacy Antigravity model
environment overrides. The visual service reports the actual provider and both
model IDs at `/api/visual/health`.

### Isolated free OpenRouter trial

Use `OPENROUTER_API_KEY` with the explicit `openrouter-free` visual provider.
Both generation and vision IDs must end in `:free`. This provider sets a zero
prompt/completion price ceiling, disables implicit provider/model fallbacks, and
rejects truncated responses. It reserves a bounded reasoning allowance in
addition to each stage's JSON output allowance. Model usage and reported cost
are available in the test service's health response.

For example, start a separate process without changing saved chat settings:

```sh
PYTHONPATH=src .venv/bin/python -m assistant.visual.server --port 4173 \
  --visual-provider openrouter-free \
  --visual-model nvidia/nemotron-3.5-super-vl:free
```

The vision model follows this command-line model unless explicitly overridden
with `--visual-vision-model`. Lesson cache identities include provider and model,
and newly generated lessons record their generation/vision provenance. A trial
must still pass factual, narrative and actual rendered-frame review; a working
endpoint is not evidence that its lessons are better than another model's.

### Optional OpenCode free visual models

OpenCode is an opt-in alternative. To use the installed, authenticated OpenCode V2
CLI, explicitly change all three settings in `[llm]`:

```toml
visual_provider = "opencode-free"
visual_model = "opencode/mimo-v2.6-flash-free"
visual_vision_model = "opencode/nemotron-3.5-super-vl-free"
```

`opencode/deepseek-v4.1-flash-free` is another supported text selection.
An empty `visual_provider` inherits general chat. This adapter uses the real native
client because OpenCode's free chat tier requires it; the Go HTTP endpoint is a
separate subscription route. Existing OpenCode authentication is reused.

Each request uses an isolated directory and explicit free model IDs for both the
requested task and maintenance agents. Tools and delegation are denied. Frame
review attaches the actual PNG/JPEG captures to the selected vision model. Quota
errors stop the request, retain the unapproved draft, and never invoke Go, a paid
model, or Antigravity. Reported cooldowns suppress repeated calls to the exhausted
model for the lifetime of the service; the lesson harness does not immediately
retry them. The health endpoint identifies this route and its two model IDs.

On October 29, 2026, real native-client smoke tests for both DeepSeek and MiMo
returned HTTP 429 `provider.free-limit`; the adapter reproduced the error and
reported the provider's cooldown. Transport and quota handling are verified, but
free-model lesson quality and vision approval remain unverified until access
returns. A configured model is not evidence of a successful generated lesson.

Antigravity diagnostics must identify the requested model. The October 29 Module 6
failures recorded at 01:12 were `RESOURCE_EXHAUSTED` / “Individual quota reached”
for the temporary `claude-sonnet-5-5-medium` override. They do not establish that
`gemini-3.8-flash-high` was exhausted. A later Gemini request through QWEEPS's
structured transport returned valid JSON in about eight seconds; this verifies
text connectivity, not a completed course or image review. The transport now reads
recognized quota diagnostics from a private per-request CLI log, reports the model
and provider reset interval, and prevents the lesson harness's immediate retry.
It also requires a completed success event rather than accepting partial text.

## Live Hyperframes pilot

Open `http://127.0.0.1:4174/?scene=rizal_live&paused=1` for the live Rizal
lesson. Broad requests such as `visual "Explain Jose Rizal history"` open this
route. It uses live SVG geometry, real font outlines, GSAP and the installed
Hyperframes core GSAP frame adapter; no video or native frame rendering is
requested. The Hyperframes player package is installed but the QWEEPS player
provides the interactive controls. Both Hyperframes packages are pinned to
0.8.211 because the browser-safe adapter is imported directly from that package.

Pause, scrub, select objects or drag a region, pan, zoom and ask the configured
model a question. **Ask & explore** lets the model choose an authored focused
view and explain why it helps. Returning restores the parent time, camera,
selection, region and narration position. Plain answers can use retrieved
sources beyond the narration. Cached narration audio is independent of the live
visuals. This route remains the authored reference lesson. Unknown topics and PDF
requests now use the separate generated live-lesson pipeline below.

## Generated live lessons from PDFs or topics

Ask QWEEPS `Teach me Module 6`, or open `/?live=1` and attach a PDF. The source
library matches saved document titles, filenames and module numbers; an ambiguous
or missing module asks for its source instead of inventing its contents. Explicit
local PDF paths are also accepted. Imported PDFs stay in the user's local data
directory, outside the repository. Scanned PDFs need OCR before import.

`documents.py` extracts numbered pages. `browser_lessons.py` asks the configured
model for a teaching plan and directs small, resumable sections using the shared
teaching guidance. A separate source audit checks every beat's claims and
qualifications before browser review, with up to two bounded text-correction
passes for unsupported assertions. Corrections preserve identities, evidence,
assets and layouts rather than regenerating unrelated content. Rejected
direction attempts and source reviews remain in the local
cache for diagnosis. The browser constructs the candidate with live SVG, GSAP and
the Hyperframes adapter, captures early and completed states, and submits those
actual frames for model review against the relevant source pages. A rejected
candidate gets one revision; an unreviewed or failed candidate is not published.
Frame captures are review images, never the playback medium.

The renderer currently supports comparisons, labeled processes, matrices,
concept relationships, schematic timelines and spatial mnemonic routes with
curated SVG assets and useful descriptions. These families support generated
content and mixed teaching methods; they do not provide arbitrary new geometry,
3D simulations or unrestricted generated code. State capability gaps honestly.

Reviewed lessons retain source page citations and support the same pause, seek,
selection, region and camera controls. Optional worked-case choices highlight
their relevant objects and explain the outcome. Questions retrieve relevant PDF
pages beyond the current narration. `Ask & explore` generates a new focused live
lesson, reviews it, and saves the parent lesson, time, camera, selection, region,
case choice and narration position for return. AI/provider failures stay visible;
do not substitute a canned lesson or answer. Inspect real browser playback as
well as the automated checks before declaring an end-to-end request verified.

In the live player, Left/Right review the previous/next beat at its completed
state. Shift+Left/Right jump to its exact start. The arrow buttons support the
same Shift-click behavior. Navigation pauses speech/playback and restores an
overview; typing in the question box keeps normal text-editing keys. Each chapter
declares `finishedAt` before its outgoing transition, so a completed-beat jump
does not land in a fade or halfway through a transition.

The official `hyperframes` and `hyperframes-cli` skills are installed locally
alongside the QWEEPS teaching skill. Their progressive-diagram, deterministic
timeline and visual-review guidance applies to this pilot. Video export and
baking workflows are excluded by the user's live-only requirement. The
storyboard and review live in `visual-studio/lessons/rizal-live/`.

The revised Rizal storyboard adapts the user's approved HyperFrames ZIP: origins,
European study, the two novels, Dapitan, trial/farewell and public memory. Dates
and descriptions are part of the infographic. Eye and quill geometry are sourced;
all focal strokes develop continuously before their fills. Six matching narration
clips are bundled in `public/lessons/rizal-live/`.

## Teaching method

New visual lessons use the `qweeps-visual-teaching` skill through a three-stage
harness: **storyboard → animation direction → teaching review**. The primary
reference set is the user's **PDF Explainer**, **Math 01: Neural Net &
Loss Curve**, and the existing **A* Pathfinding & Heuristics** lesson. The other
ZIP examples remain unapproved except for the later HyperFrames Rizal storyboard,
which the user explicitly approved and allowed us to adapt. The user also authorized
supplementary 3Blue1Brown method studies, described below.

Presentation is selected by learning goal, prior knowledge and evidence. Mathematical
or geometric derivations can use 3Blue1Brown techniques; descriptive infographics,
worked code execution, cutaways/simulations, comparisons, charts and practical
demonstrations have their own methods. The planner records the choice and rationale
in `representation`. The director receives extra 3Blue1Brown studies only when
the selected references call for them. Review judges the chosen method's fit rather
than enforcing minimal text. Infographics retain useful names, definitions and
descriptions.

When recall is a goal, the skill also offers stable spatial routes/method of loci,
visual mnemonics and paired verbal/visual cues. Kinetic explanation directs attention
through staged construction. These techniques can be combined without forcing a
memory-palace layout onto every subject. Mnemonic plans explain their cue-to-fact
mapping and a retrieval opportunity; no fixed recall gain is promised.

The planner chooses a learning goal, one trackable example, an appropriate
representation, and distinct visual inferences. Each beat records its learner
question and the visible before/change/after that answers it. It does not turn
loop iterations into repeated explanations. The director implements that plan
with actual semantic objects, timing and camera choices. The reviewer checks
whether those objects and transformations visibly support the intended inference.

Structural checks reject repeated insight/narration with changed numbers, missing
visual evidence, lost anchors, and scenes whose only change is narration. A model
review checks semantic progression and decorative motion; it is a quality gate,
not a guarantee of teaching quality. One revision is allowed before a failed
lesson is reported, preserving the parent's visual state. Ordinary text answers
remain a single response; a question requesting a visual must pass the harness.

The shared skill lives at
`src/assistant/visual/teaching_skill/qweeps-visual-teaching/SKILL.md`, with method,
reference studies and a storyboard/review contract under `references/`. It is also
linked into `~/.codex/skills/qweeps-visual-teaching` for use by Codex. The package
includes these resources so installed QWEEPS uses the same method. The resulting
scene retains its storyboard, per-beat evidence and review in `scene.teaching`;
paused follow-up requests receive this context too.

The current interactive compiler's limited primitives are explicit inputs to the
planner. The skill can guide native Manim authoring when richer geometry is
available; it does not claim that the browser compiler can reproduce arbitrary
curves, surfaces, or simulations. A capability gap should be reported rather than
silently replaced by a generic flowchart.

## Start

```bash
qweeps visual astar
qweeps visual "Explain how an ALU works"
qweeps visual "Compare old and new entrepreneurship methods"
qweeps visual --no-speak astar
```

`visual serve` runs the server in the foreground. Normally the launcher starts
it automatically and verifies its health. It uses the existing QWEEPS model
configuration and credentials; provider keys never enter the frontend bundle.
Server diagnostics: `~/.cache/qweeps/visual-server.log`.

The desktop launcher uses a Chromium app window, requesting the `qweeps-visual`
class. Wayland browsers can use an origin-based app class instead.
On Hyprland 0.55+ it removes that window's border at runtime. The window remains
tiled next to the workspace. Esc sends a graceful close request to the exact app
class, session title, and address. No Hyprland configuration is changed. In an
ordinary browser, browser restrictions may leave a closed-session page visible.

## Explore

- Play/pause with Space; step with the arrow keys or scrub the progress slider.
- Select a cell/object, or drag a rectangle around a region, then ask a question.
- Drag S/G to rerun the actual A* search. Its graph has four neighbours, unit edge
  costs, fixed walls, and Manhattan h. The open queue is ordered by f, then h,
  then coordinate ID. The final path comes from stored parent links.
- Generated diagram objects can be dragged to experiment with their layout.
  These diagrams do not automatically simulate the underlying subject.
- Right-drag pans the camera. Generated diagrams also support wheel zoom.
- Ask normally for a contextual answer; use Branch for a new visual explanation.
  Each branch saves its parent time, camera, selection, source plan, and edits.
  Return to lesson restores that complete checkpoint. Branches can nest.
- Use New lesson to replace the lesson with a new topic. The conversation remains.
- Paste relevant code or an excerpt into Source context for project-specific
  questions. There is no automatic repository/document retrieval or web research.
- Dictation uses the browser's SpeechRecognition capability when available.
  The QWEEPS voice interface can also send questions and controls through the
  shared local session. Browser microphone permission and support still apply.

Narration uses cached Fish/OpenRouter MP3 clips with a persistent browser audio
playhead. Generated lessons synthesize the whole lesson script in one request,
retaining one vocal performance across visual checkpoints. Gemini chooses exact script phrases for
object introductions, returns and context, checkpointed per beat. A local faster-whisper worker obtains
word timestamps from the recording; transcript matching locates those phrases and
rejects weak/missing alignments instead of guessing timing from word counts.
The compiler retains that full recording in one WAV track, with a single lead-in
and closing hold. This prepares speech only: illustrations remain live SVG/GSAP.
The director sees the whole lesson progression when writing each passage, so
transitions explain why the next question follows from the preceding idea.
New storyboards and directed beats carry `continuity.from` and a concise
`continuity.bridge`: the preceding result, its remaining question, and why this
step helps. The bridge is visible beneath the learner question. After factual
review, a separate whole-lesson narrative review checks every adjacent boundary
and quotes its actual spoken bridge. Factually correct isolated topic summaries
cannot pass that gate. Revisions preserve this metadata alongside source pages,
assets and the shared example. Audio being one file does not satisfy this check.

The speech track's media position drives narrated visuals. The object being
discussed draws and receives an attention outline; future objects remain hidden
until their own spoken cue. Pause, seek and branch return use the same audio and
visual position. Several objects may share a collective cue, and revisiting an
earlier concept can highlight it again without redrawing it. Supporting details
not individually named are marked as context rather than falsely spotlighted.
The player loads this track before enabling narrated playback,
so there is no new synthesis request at each chapter boundary. Muted playback
uses the same measured cue timeline. Authored legacy lessons retain their existing
clip transport and prefetch behavior. Provider failures leave captions available.

Visual beat boundaries follow measured gaps between passages in that recording.
No fixed per-beat silence is inserted; fade durations fit the natural pause.
For an explicit reasoning bridge, `visualStart` is the measured end of its spoken
words, while `start` remains the audio passage boundary. The previous completed
diagram stays visible and interactive through that bridge. At handoff the next
scene begins its construction and crossfades with the previous scene. Captions
follow speech; selection, questions and visual navigation follow the visible
diagram. The spoken connection therefore does not lose its visual reference.
Version-2 cached lessons remain available while upgrading from their separate
beat recordings. Completed-beat arrow targets still contain the finished illustration;
rewinding reconstructs the same paced drawing. These rules apply to live browser
playback; the separate legacy/native player retains its own speech timing.

Alignment runs locally using the existing cached faster-whisper small model and
runtime. `QWEEPS_ALIGNMENT_PYTHON` and `QWEEPS_ALIGNMENT_MODEL` can select another
installed runtime/model. It does not download weights automatically or use paid
transcription as a silent fallback. Word-timing caches are keyed by actual audio
bytes and the alignment engine version, separately from the speech-text cache.
Whole-lesson requests support up to 24,000 script characters in QWEEPS; upstream
provider limits still apply. Incomplete recordings fail per-beat transcript checks
and do not replace the current reviewed lesson. One recording takes longer to
regenerate after a script edit, while navigation and branching remain independent.
Phrase mappings are checkpointed per beat. If a structured Antigravity request
attempts unrelated tools or exceeds its deadline, preparation reports that
failure instead of retrying the entire long request indefinitely. A previously
reviewed synchronized track remains available until its replacement is complete.
The Antigravity CLI does not expose a hard response-token limit for these calls;
QWEEPS's requested token budget is therefore not a guaranteed limit on that route.
On the Module 6 migration, a simple Gemini 3.8 Flash High prompt completed in
about nine seconds, while two mapping prompts emitted no response events for 90
seconds. A shorter variant repeatedly invoked shell and web-search tools despite
the data-only instruction. This shows a CLI-agent tool detour and a separate
silent stall; it does not establish that every timeout was a server overload or
quota exhaustion. Text-only requests no longer automatically approve tool use.

## Scene harness and Manim

The model returns a JSON answer and optionally a scene plan. Plans contain up to
8 independently seekable beats with semantic element IDs, positions, camera,
narration, and basic vector primitives (boxes, ellipses, text, lines, arrows).
The harness validates finite bounds, sizes, colours, and edge references. It
requests one correction on malformed output, then reports the failure while
preserving the paused scene. It does not substitute scripted answers on failure.

The production measurement lesson (`?scene=manim_production&paused=1`) uses actual
GPU-rendered ManimGL frames streamed over loopback with semantic hit regions. It
supports native transforms, camera moves, SVG imports, rewind, selection and
bounded data experiments. Question branches select a reviewed representation and
validated parameters, then return to the saved parent. Arbitrary new native scene
generation is not implemented by this parameter-branch path.

Existing generated primitive plans and older scenes still use SVG/Canvas; they
do not inherit the native renderer’s visual range. A deterministic compiler turns the same validated
plan into a Manim Community Edition `MovingCameraScene`. Model-generated Python
is never executed. Manim source export and rendered MP4 previews are available
for generated plans. The exported video contains geometry, without a narration
track. Existing legacy scenes remain available in `?mode=studio`.

Manim CE is installed separately from the older ManimGL environment:

```bash
uv venv ~/.local/share/qweeps/manim-ce
uv pip install --python ~/.local/share/qweeps/manim-ce/bin/python manim
```

The worker also checks its own Python environment, or the interpreter specified
by `QWEEPS_MANIM_PYTHON`. Renders are serialized, have a three-minute timeout, and
are stored under `~/.cache/qweeps/visual-renders/`. Restart the visual
server after changing its environment or installing Manim.

This first version creates diagrams and worked explanations. It does not yet
generate arbitrary 3D geometry, execute experiments in game engines, retrieve
sources, or match a hand-authored 3Blue1Brown film's animation quality. Source
claims are based on supplied context. Sessions/checkpoints currently live in
memory and are lost when the tab or server is restarted.

## MCP

The optional MCP facade operates on the same active session as the browser and
voice controls. It uses the official Python MCP SDK (v1 compatibility range).

```bash
cd ~/Work/qweeps
uv run --extra visual-mcp qweeps visual mcp
```

Client configuration example (add to the chosen MCP client's server settings):

```json
{
  "mcpServers": {
    "qweeps-visual": {
      "command": "uv",
      "args": ["run", "--directory", "/path/to/qweeps", "--extra", "visual-mcp", "qweeps", "visual", "mcp"]
    }
  }
}
```

Tools: `visual_open`, `visual_state`, `visual_ask`, `visual_control`, and
`visual_render`. No client settings are modified automatically. MCP provides a
common way for another assistant to inspect and control the learning session;
the harness owns the lesson state, validation, branching and rendering.

## Development and checks

```bash
# Assistant
uv run --extra visual-mcp --with pytest pytest -q
# Studio
npm --prefix visual-studio ci
npm --prefix visual-studio run lint
npm --prefix visual-studio test
npm --prefix visual-studio run build
```

For frontend development, run `qweeps visual serve` and `npm run dev`
in separate terminals. Vite's dev and preview servers proxy `/api`, `/narration` and `/renders`
to the loopback host. `QWEEPS_STUDIO_DIR` overrides the studio directory.

API surface under `/api/visual`: health, session, state, events, ask, control,
reply, source, render, speak, stop, window, closed. Model requests include the
paused view, selected IDs/region, actual grid queue/costs or diagram elements,
source context and the last conversation turns. The server rejects foreign
origins, unexpected hosts, non-JSON writes and oversized input.

## References reviewed

- https://github.com/3b1b/videos — visual design/workflow reference; scene content
  has a noncommercial share-alike licence and some code targets older ManimGL.
- https://github.com/paulnegz/manim-mcp — text/code/video pipeline; a separate
  render service alone does not supply an interactive timeline or hit testing.
- https://mcpservers.org/agent-skills/browser-use/manim-video — planning, pacing,
  independent scene rendering, and visual-review ideas.
- https://docs.manim.community/en/stable/reference/manim.scene.moving_camera_scene.MovingCameraScene.html
- https://github.com/modelcontextprotocol/python-sdk


## Infographic reasoning and regression prevention

The user accepted the authored Python, ALU and world-generator studies. The first
history infographic exposed a different failure: labeled events and influence
particles left most reasoning to narration. The teaching skill now includes
`references/visual-reasoning.md` and pinned `references/3b1b-studies.md`, covering
concrete samples before abstraction, regrouping, changing perspective, preserving
data while re-encoding, and exposing intermediate relationships. These are method
studies of source scenes, not imported ManimGL code or claims of watching videos.

New generated lessons carry version-2 teaching metadata. Their storyboard chooses
an explicit visual grammar, encoding meanings, a likely misreading and visible
safeguard; every beat states a caption-free visual test. The direction gate rejects
text-only evidence and unchanged cited evidence concealed by a new heading/camera.
Review records a caption-free answer and misreading safeguard for each beat, plus
five judgments: visible relation, encodings, continuity, reading load and timing.
An approved review cannot include failed checks. Version-1 saved scenes still load.
These are model judgments about scene data, not a rendered-frame teaching test.

The skill's `scripts/render_review.py` runs the actual CE interpreter, requires a
successful exit, fingerprints source and video, validates media/chapter metadata,
and captures start/middle/end frames from each beat for inspection. The revised
native history scene additionally audits projected label bounds/overlap after
animations and starts individual narration clauses when their referents appear.
Native frame/playback review remains necessary before publishing. Scoped AGENTS.md
files route future repository work to this same skill; failure-prevention.md records
the observed technical failures and specific checks rather than generic rules.

## Native production measurement lesson

The repository includes the studio in `visual-studio/`. The host prefers this copy;
`QWEEPS_STUDIO_DIR` can override it. Native live rendering uses
`~/.local/share/qweeps/visual-venv/bin/python`, or
`QWEEPS_MANIMGL_PYTHON`; the reviewed machine has ManimGL and an OpenGL GPU context.
The trusted worker receives only bounded time, camera, selection and experiment
data. It renders into a private RAM directory, with at most three local workers.
Closing the session terminates its worker. No model-generated Python runs here.

The production report is a frozen numeric snapshot of completed earlier work;
it excludes the profiling lesson itself. Job intervals are dispatch-to-completion
detection bounds and overlap. Model cost is a hypothetical GPT-6.1 Sol token value
using per-request Standard pricing and long-context tiers, not an OpenCode invoice
or an official Go model tariff. TTS, hardware and electricity dollars are unknown.
The exporter is tailored to the six recorded turns, not a general-purpose profiler.

Additional API routes: `narration`, `native/state`, `native/frame`, `native/stream`, `native/close`.
Cached narration is served with byte-range support under `/narration/`.

## Follow-up evidence for the Rizal lesson

The Rizal question path retrieves relevant passages from the lesson's public,
allowlisted source pages and supplies the actual passages to the model along with
the paused selection and any user-provided context. The UI lists the sources
consulted. The question and source context are not sent to a search engine. When
retrieval fails, the model is asked to distinguish unverified general knowledge;
when the configured model fails, QWEEPS reports the failure instead of silently
substituting a canned answer. This is source-page retrieval for the Rizal lesson,
not unrestricted automatic web search for every QWEEPS topic.

## Generated native lessons: current scope

The generated plan player can send validated lesson data to the local ManimGL
worker. It supports timed shapes, text, links, bounded straight or smoothed
vector paths and self-contained SVG geometry, with seeking, native hit regions, camera controls and saved parent
positions when a generated branch is opened. The paths are data, not Python.
This remains a restricted scene compiler: it cannot generate arbitrary Manim
code, import externally referenced SVGs, create arbitrary simulations or guarantee
authored-example quality. SVGs reject scripts, external references and unsupported
elements. Native frame review samples each beat and asks an image-capable model to
identify visible failures; a rejected candidate receives revision feedback. If
image review is unavailable or fails, QWEEPS reports it rather than calling the
candidate reviewed. This model review remains fallible and does not replace human
playback review.

Antigravity lesson generation and review use the explicit
`gemini-3.8-flash-high` model pins in `[llm]`.
`QWEEPS_ANTIGRAVITY_VISUAL_MODEL` and `QWEEPS_ANTIGRAVITY_VISION_MODEL` remain
legacy overrides for an inherited Antigravity route without explicit model pins.
The review uses a sandboxed image-reading agent and temporary frame files. These
settings do not change the ordinary conversational model.
## General-topic mechanism diagrams

Generated live lessons can choose a `diagram` layout with positioned semantic
groups, bounded SVG primitives and cue-driven translation, scale and opacity.
All motion shares the seekable narration timeline; no generated code executes.
This adds geometric mechanisms alongside the existing infographic layouts.
The current interaction choices highlight objects and explain cases; they are
not numeric simulation controls.

Lessons without a PDF now pass an explicit model factual review. The saved review
identifies this as a model check without retrieved sources, rather than claiming
document verification. Generator improvements should be tested by regenerating
through the service, without editing generated lessons or narration by hand.

If a provider interrupts preparation after a draft is saved, the preparation UI
offers **Resume saved preparation**. The service revalidates that draft and reuses
completed review checkpoints. A resume stays attached to its original question,
document and branch context; it does not mark an interrupted review as approved.
Factual and narrative correction allowances are independent. Factual review
receipts are keyed by the actual section input and review instruction, so a
local correction does not re-send unchanged sections to the provider.

## Per-beat teaching choices

New live storyboards and directed beats each declare `presentation` with a
free-form `method`, its `why`, observable `visualEvidence`, and `textMode`.
The planner chooses from the learner's current question and preceding result;
`representation` retains the common anchors and reasoning chain. Methods can
change between beats or continue across a construction without a variety quota.

`textMode: labels` uses the positioned `diagram` stage with more room for artwork,
short labels and a concise conclusion. Supporting node descriptions remain in
selection context and can be read through **Details**, without adding paragraphs
to the construction. `descriptive` keeps useful prose on the stage in any supported
layout, including annotated diagrams. Existing saved lessons without these fields
retain their previous rendering. New prompts/guidance produce a new generation
cache key; existing reviewed outputs are not rewritten.

Frame review must record per-beat method fit, visible evidence and text suitability;
a failed judgment prevents approval. This is a review requirement, not a guarantee
of model quality. Renderer QA can use clearly labeled internal fixtures; those
fixtures do not establish that a model generated or reviewed a fresh lesson.

Detailed diagram beats are directed individually within the same lesson plan;
lightweight infographic beats may share a two-beat response. This prevents multiple
vector constructions competing for one response budget. The director also receives
explicit node-field/position constraints, and validation returns multiple object
field defects together. It never fills in missing geometry or silently treats a
truncated model response as a completed lesson.

API-backed custom-diagram requests reserve 9,000 output tokens per beat, plus the
provider's bounded reasoning allowance; lighter sections reserve 4,200. The
Antigravity CLI adapter currently does not forward `_chat(max_tokens)` as a hard
output-token limit. A comparison between its Gemini route and the strict OpenRouter
route therefore does not hold response caps constant and is not a controlled model
benchmark.

Targeted revisions preserve the lesson's shared header metadata directly in the
harness; the model's editable scope is the selected chapters. Unflagged chapters
must still match verbatim. This avoids extra provider calls just to recopy an
unchanged title, example or overall rationale.
