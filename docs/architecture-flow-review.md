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
