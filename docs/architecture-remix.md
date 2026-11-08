# Complete architecture replacement

The active architecture feature uses the complete supplied
`remix-qweeps-architecture-&-code-tracing-prototype (3).zip`: both procedural compilers,
data types, ELK layout, timeline, nested lessons, presets, gap-filler/tutor
and GitHub scanner. Source is under `vendor/architecture-remix/`. `UPSTREAM.json`
records the archive checksum and unchanged core-file checksums.

Open `http://127.0.0.1:4174/?architecture=1`. The architecture choice on the QWEEPS
home screen opens this compiler. Saved architecture lesson links enter the
replacement. The former architecture-authoring job endpoint returns the new
workspace URL rather than running the previous model-authored graph pipeline.
Existing lesson files remain intact. The earlier architecture modules serve only
legacy saved-job review/compatibility, not the current compiler.

## OpenCode Go setup

The gap-filler and contextual tutor now use the shared QWEEPS Settings / API
OpenCode Go credential and visual model (currently `opencode-go/muse-spark-1.3-contributor`).
No separate Gemini key is needed. Settings changes apply on the next request.
If a different provider is selected for other QWEEPS features, architecture uses
the default Go Muse model with the shared Go key.

The ZIP's system instructions, user prompt templates, response schemas and low
reasoning setting are preserved. Only the provider transport changes: Muse uses
OpenCode Go's Responses endpoint; the other Go models offered in QWEEPS use its
chat endpoint. See [OpenCode Go endpoints](https://dev.opencode.ai/docs/console/go#endpoints).
Credentials travel only between the local Python and Node backends, never to the
browser bundle. `GET /api/ai/status` reports provider, model and credential readiness
without returning credentials. Compilation, playback and saving still work
without a key; AI requests report missing credentials or provider failures honestly.

Python starts the supplied Node/Express backend on loopback port 4175 when first
used and proxies only its explicit API routes. QWEEPS remains on port 4174. Node
is required for this desktop setup.

## Preserved implementation and hosting additions

The compilers, canvas, sidebar, timeline, layout and nested teaching data are
unchanged from the ZIP, apart from provider-name labels. Its public assets and source examples are kept; only
duplicate `.aistudio` temporary media was omitted. Hosting additions provide app
entry/exit, lossless bundle save/reopen and a loopback API process. Bundles live
in `~/.cache/qweeps/architecture-walkthroughs/` and appear in the QWEEPS library.
AI enrichment updates explanations in the same bundle without invoking the
former architecture generator.

The supplied fixtures and limitations are preserved too. The default QWEEPS
walkthrough has authored illustrative values and a teaching pipeline, not a
recorded execution or evidence of narration/frame review. The GitHub scanner
samples up to fourteen supported files and uses pattern-based definition/import
extraction. The repository compiler constructs the supplied QWEEPS teaching model;
it is not an exhaustive generic repository call graph. Source is displayed, not
executed. Local compile times vary; the ZIP's “under 3 ms” labels are not a
runtime guarantee. The ZIP's playback clock replaces the former architecture
audio transport; fixture labels do not imply a new audio recording.

## Development

`npm run dev`, `npm run build`, `npm run lint` and `npm test` prepare the upstream
browser module automatically. `npm run architecture:check` checks the full
upstream TypeScript project with its compiler settings. Esbuild compiles its
source directly; the host does not reimplement the engines.

Tests cover archive fidelity, presets and seventeen nested modules,
explanation-only enrichment, rewind, backend route boundaries, missing-key
behavior and lossless persistence. Live OpenCode Go success needs a configured key.

## Update 3

The complete third archive is active, including the compact debugger theme, Inter/JetBrains Mono fonts, reactive inspect-preview archetypes, packet-arrival reveal timing and single-beat inspection playback. Core source hashes reference this archive. Saved bundles carry an engine revision; older bundles are recompiled from their saved source and input when opened. Completed AI prose is retained for custom bundles. The previous source and saved bundles were backed up under `~/.cache/qweeps/upstream-migrations/` before replacement; the previous local Gemini `.env` was left untouched and is no longer used for inference.

## Experimental recorded voice (after the report 2.1 snapshot)

Press Run with Voice enabled to prepare the current view as one connected spoken
explanation. It uses the shared OpenCode Go model for a spoken script and exact
semantic cue phrases, the configured Fish/OpenRouter voice for one recording,
and the existing local faster-whisper runtime for measured word timestamps.
The original gap-filler/tutor prompts and procedural diagrams are unchanged.

The recorded audio owns playback time. A monotonic piecewise map ties measured
phrases to existing packet departures, arrivals and settled results. The prior
completed frame remains during the incoming reasoning bridge. The timeline shows
recording seconds, and the caption displays the actual spoken sentence. No guessed
alignment is published when a phrase or recording cannot be matched.

Pause retains the clip. Forward/rewind seeks reconstruct the existing deterministic
scene from the measured map. Inspect pauses and checkpoints the parent recording;
each inspected view is prepared on demand and cached independently. Back restores
the parent clip and exact audio position, paused. The prototype's first-beat inspect
preview still stops at its beat boundary; Run continues through the remaining beats.

Voice can be muted for silent playback. Preparation has an explicit Cancel action;
pausing or navigating away cannot cause a late provider response to start audio.
Provider failures leave the diagram usable and report the error. Root and function
recordings are cached in `~/.cache/qweeps/architecture-narration/`, with audio under
the existing narration cache. Source, graph, scope, model and voice changes
invalidate the corresponding cache. Credentials remain backend-only.

The feature requires ffmpeg, the existing cached faster-whisper model/runtime, and
Fish/OpenRouter speech configuration, as documented for visual lessons. It remains
a desktop experiment and is not an Android implementation. Voice timing is separate
from verification that a template's architecture/content is correct: the existing
fixture and source-analysis limitations still apply.

The PDF and ZIP prepared for report 2.1 are frozen snapshots from before this voice
implementation. Their planned-work status remains accurate for those deposited bytes.
