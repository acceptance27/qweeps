# Supplied prototype restoration — 6 November 2026

The first implementation (`ff105be`) simplified the supplied ZIP into a different player. The user rejected that reinterpretation and explicitly requested the original implementation. This revision copies and uses the original React component tree, compound port geometry, rich visual variants and interaction design. QWEEPS' existing lesson URL now opens that workspace.

## Browser checks

Compared the original ZIP running on port 3001 with the restored QWEEPS route on port 4174. Both were opened at 1280×720. The overview, compact header, original 34% sidebar, nested compound blocks and wires, minimap, caption region, gold playback controls and seven beat tabs are retained. The original data modules remain intact; numerical corrections are applied separately without flattening their fields or illustrations.

Checked the outer `embed(question)` view and inner `@tokenize` view in the actual browser. Both preserve the full goal/input/output sidebar and detailed static/input/logic/output cards. The inner view retains colored token tiles, the cleanup mapping and discard bin. All seventeen function modules and the specialized visual variants are also covered by fidelity tests.

The original evidence interaction opens the prepared three-document modal, highlighting the refund-policy sentence, keeping returns-guide as procedural context and showing shipping-guide excluded. The drawer retains prepared question cards, explicitly authored responses and its three-step mini-explanation. The added real-question composer received a provider-backed answer correctly naming the raw input string and Beat 1 from the paused context.

At 10 seconds, seeking to 45 seconds and back reconstructed an identical serialized diagram. Playback from 7.95 seconds advanced automatically into Beat 2 and paused at 8.467 seconds. Navigation does not require clicking Next for each beat.

A local browser probe captured the actual restored workspace as a self-contained image, including HTML visual cards, the full goals/output sidebar, compound diagram, minimap, caption, header and playback bar. The capture was visually inspected. `LivePreparation` uses the same renderer and capture path for architecture-only candidates; its desktop review surface is 1280×720 even when generation is initiated from a narrow viewport.

The previously generated `double(3) → 6` lesson also opens through the supplied workspace components using the QWEEPS contract adapter and actual automatic layout for its new graph. Its earlier generation/vision-review receipt predates this UI restoration and must not be presented as a new model review of the restored renderer.

## Validation and scope

Frontend type checking and 91 tests pass. The architecture/browser/synchronization Python selection passes 99 tests. An existing interruption/resume test exposed an ordering assumption: its mocked second request could fail before the supposed completed first request ran. Its setup now explicitly coordinates that completed mapping before triggering interruption; production cancellation behavior is unchanged.

The Android release APK builds with the restored workspace. Browser viewport checks cover portrait and landscape. These checks and a successful APK build are not a claim of physical-device testing. The authored reference retains its original short visual timeline; optional reference/function speech uses individual clips with authored proportional timing. Existing generated continuous tracks keep their measured audio clock.

## Generator repair acceptance — 6 November 2026

The generator now exposes Learn, Design and Inspect as separate goals. The real Learn run [RAG with Headset Return](http://127.0.0.1:4174/?lesson=c2f23f412a9ebe90c9eb4ea2ec59ea01) and Design run [Small Shop Support RAG](http://127.0.0.1:4174/?lesson=a8493a9501e6d83711faf9347c7ef9fb) passed provider factual, continuity, synchronized narration and actual browser-frame review. These are generated lessons, not the supplied RAG fixture. The acceptance records are in [the generator run](../bench/runs/architecture-generator-2026-11-06/summary.md).

The Design run reproduced a shared-contract correction failure: displayed code used a dot product while the example calculator used cosine similarity. Chapter-only revisions could not repair the shared graph. The new bounded shared-contract repair corrected the operation specification, recomputed its dependent values and reran the affected chapters and reviews. Derived values and graph identities cannot be patched directly.

Browser inspection covered generated function drill-down, exact parent restoration, source file/line switching, arbitrary seek and rewind, and continuous playback without Next. Pause remained at exactly 53.485081 seconds across subsequent interactions. A second real vision review examined twelve screenshots of the current Learn workspace after the follow camera and card-size changes. Follow mode tracks the active transfer at readable scale when a focused group would be too small; Overview remains available for the complete graph.

The 390×844 portrait and 844×390 landscape forms fit the goal/source controls and actions without page overflow. Portrait Diagram/Code tabs work. The shared heading uses the actual generated beat count, mobile header controls stay compact, and long grounding details remain bounded inside the viewport. Android release build/signature verification is separate from physical-device testing.

Repository scanning remains a bounded static overview, not a full call graph or execution trace. New repository-generated flows reject runtime packets and variable state. Python import parsing, inferred JS/TS imports, disconnected files, single-file projects, relative imports, outside-root symlinks and stable import IDs have regression coverage. The older repository lesson's approval does not validate this stricter generation guard.
