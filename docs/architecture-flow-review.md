# Architecture tracing verification — 6 November 2026

The user-supplied prototype was adapted as an authored reference, not presented as an AI-generated result. All seven main final states were inspected in the actual QWEEPS browser player, together with representative outer/inner function views, inspector contents and code references. The reference contains seventeen validated function modules; this does not claim an independent learning-outcome evaluation or visual review of every module state.

Corrections made during adaptation/review:

- Replaced fixed coordinates and an ID-only layout cache with actual ELK layout keyed by full graph content.
- Preserved source indentation and monospace rendering; kept long values accessible in the inspector.
- Corrected the worked raw-vector norm from 2 to 1.8891267824 and recalculated the unit vector. The displayed rounded result has norm approximately 0.999990.
- Made the toy stopword and punctuation rules explicit, corrected the input string length to 39 characters, and identified prepared similarity scores.
- Removed promises of an app-wide clickable citation link which the adapted viewer does not implement; inspection shows the connected illustrative source passage.
- Kept text replies on the real QWEEPS provider and discarded the prototype's canned-answer system.
- Created the writable speech-checkpoint directory before synchronizing a bundled lesson and atomically published the returned synchronized lesson.

Playback checks:

- Browser viewport 390×844: Diagram/Code tabs and transport fit the portrait page.
- Browser viewport 844×390: split code/diagram view and compact controls fit landscape.
- Seek at 28 seconds → 122 seconds → 28 seconds: identical packet progress 0.76199, SVG transform and camera after rewind.
- Nested function return: restored the saved parent at 139.01 seconds.
- Real generated lesson audio: paused audio at 17.384911 seconds, visual playhead 17.368 seconds; both remained paused across subsequent observations.
- Real contextual text reply explained the selected `embed()` call, retained the exact displayed vector and identified its illustrative nature.

A separate fresh three-beat `double(3) → 6` lesson ran through the configured generation provider, factual/narrative checks, continuous Fish narration, measured word alignment, nine actual browser review frames and the vision reviewer. Its local lesson ID is `b9b5f4202374e5509e1cbe05c1dd44d2`; the review receipt reports approval without findings. Recorded phases: storyboard 43.722 s; shared architecture 113.345 s; artwork 277.973 s (includes architecture work); factual review 23.663 s; narrative review 13.196 s; speech 168.518 s. These are one smoke run, not a speed benchmark. Cached receipts live with that generated lesson in the normal runtime cache and are not shipped as source fixtures.

The Android release APK builds successfully with the bundled frontend, Python and authored example. Mobile browser QA and an APK build are not a claim of testing on a physical Android device. Prepared function modules use ordinary per-chapter narration and authored timing unless measured cues are supplied; the generated root lesson used measured continuous narration.
