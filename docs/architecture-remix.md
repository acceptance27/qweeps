# Complete architecture replacement

The active architecture feature uses the complete supplied
`remix-qweeps-architecture-&-code-tracing-prototype (3).zip`: both procedural compilers,
data types, ELK layout, timeline, nested lessons, presets, Gemini gap-filler/tutor
and GitHub scanner. Source is under `vendor/architecture-remix/`. `UPSTREAM.json`
records the archive checksum and unchanged core-file checksums.

Open `http://127.0.0.1:4174/?architecture=1`. The architecture choice on the QWEEPS
home screen opens this compiler. Saved architecture lesson links enter the
replacement. The former architecture-authoring job endpoint returns the new
workspace URL rather than running the previous model-authored graph pipeline.
Existing lesson files remain intact. The earlier architecture modules serve only
legacy saved-job review/compatibility, not the current compiler.

## Gemini setup

This feature uses the ZIP's separate Gemini setup, as requested. Set the key in
`vendor/architecture-remix/.env`:

```
GEMINI_API_KEY="your key"
APP_URL="http://127.0.0.1:4174"
```

The file is ignored by Git and never copied into the browser build. Restart
`qweeps-visual.service` after changing it. The copied backend uses
`gemini-3.8-flash`; see [Google's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash).
`GET /api/ai/status` reports readiness without returning credentials. Compilation,
presets, playback, drill-down and saving work without a key; gap-filling and live
tutor requests need it. Missing credentials produce an error, not a fabricated
successful AI response.

Python starts the supplied Node/Express backend on loopback port 4175 when first
used and proxies only its explicit API routes. QWEEPS remains on port 4174. Node
is required for this desktop setup.

## Preserved implementation and hosting additions

The compilers, canvas, sidebar, timeline, layout and nested teaching data are
unchanged from the ZIP. Its public assets and source examples are kept; only
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
behavior and lossless persistence. Live Gemini success needs a configured key.

## Update 3

The complete third archive is active, including the compact debugger theme, Inter/JetBrains Mono fonts, reactive inspect-preview archetypes, packet-arrival reveal timing and single-beat inspection playback. Core source hashes reference this archive. Saved bundles carry an engine revision; older bundles are recompiled from their saved source and input when opened. Completed AI prose is retained for custom bundles. The previous source and saved bundles were backed up under `~/.cache/qweeps/upstream-migrations/` before replacement; the local Gemini `.env` was left untouched.
