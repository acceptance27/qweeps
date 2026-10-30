# Observed failures and their prevention

Read for native authoring, rendering, or delivery. These are lessons from actual
QWEEPS work, not general restrictions on unrelated tasks.

| Observed failure | Prevention and observable check |
|---|---|
| One explanation repeated at fourteen algorithm steps | Distinct question and inference per teaching beat; put repeated execution inside it. Harness checks repeat signatures. |
| Infographic labels and generic arrows carried little reasoning | Choose a visual grammar; name the visual prediction, comparison, regrouping or consequence. Caption-free review must identify the relation. Text-only evidence cannot pass. |
| A historical influence was animated like a circuit signal | Distinguish proposal, chronology, influence and accomplished action. Label ambiguous links; review the likely wrong reading. |
| Narration described an object before its construction | Author cue times per spoken clause when needed. Inspect a transition midpoint as well as the final frame; a longer ending hold is not a fix. |
| Caption/world labels overlapped after camera zoom | Reserve title/caption regions in camera coordinates; inspect maximum zoom and camera transitions. Audit projected text bounds, not world coordinates alone. |
| Font warnings and a LaTeX-dependent number display broke rendering | Probe the actual Manim CE environment first; use available Sans/Monospace and Text-based readouts when TeX is absent. Do not assume ManimGL APIs. |
| Pillow 13 broke Cairo ImageMobject | Existing CE environment uses Pillow <13. Reuse the project's requirements and run a short image render before a long job when changing that runtime. |
| Static holds were re-rendered frame by frame because an unchanged HUD had live updaters | With a fixed camera, keep the HUD static so Cairo can cache it. Use camera-relative updaters only when the camera actually moves. |
| Audio outlasted a short test video and frame sampling used container duration | Sample using video-stream duration; reject narration extending past the visual timeline and require decoded frame files. |
| An interrupted render left older output that looked current | Require a successful process exit and a source/audio fingerprint for the reviewed artifact. File existence alone does not confirm the new source rendered. |
| Chapter clicks played from the beginning | Test forward seek and rewind against the actual host. MP4 GET responses need byte ranges; whole-file delivery alone is insufficient. |
| A Rizal draft used arbitrary polygon maps, anonymous white figures and an exile arrow with no locatable destination; review still approved it | Use recognizable sourced geometry for named places, show origin and destination, and identify actors through labels plus consistent visual encoding. Inspect scenes without narration and ask a fresh viewer which person/place is which. Record failed frames and concrete revisions against an accepted reference; functional playback is not aesthetic or teaching approval. |
| A detailed map was paired with crude eye and pen drawings, while a moving figure covered Dapitan and its label | Use assets or purpose-built drawings with comparable recognizable detail where the teaching needs it. Inspect the moving object throughout its path and at its destination, and keep markers and labels legible. Also test selected and focused states: a highlight around a large composite object can obscure unrelated content. |
| A follow-up question was limited to facts printed in the animation | Retrieve relevant source material beyond the displayed scene or use authorized project context. Give real source links and distinguish source evidence, model knowledge and uncertainty; never fabricate retrieval. |
| A simplified browser renderer lost the baked examples’ visual capabilities | Use actual native Manim for a native-quality interactive request; verify the displayed frames originate from that runtime. Keep input overlays separate from teaching geometry. |
| Pause destroyed Fish playback while the cue remained marked played | Retain the clip and media playhead; mark cues only when fired. Verify pause/resume mid-speech and while synthesis is pending on the actual host. |
| Native selection existed in the renderer but the paused browser displayed the previous frame | Use cache-busted native frame images in the browser; a multipart stream may defer painting its last frame. Verify a single paused selection/seek appears without another animation frame. Rebuild ManimGL render groups when adding highlight geometry. |
| Visual service unwrapped the primary model and bypassed Antigravity fallback | Pass the configured model chain through the visual harness; verify a real answer through the available fallback. |
| A model-provider 403 looked like a teaching pipeline failure | Report provider access separately; authored demonstrations are not live generation benchmarks. Do not replace failed AI answers with canned text. |
| A silent CLI exceeded its deadline because timeouts were checked only when stdout arrived | Enforce a wall-clock deadline independently of output, drain stderr, and terminate the owned process on completion or timeout. Test a real silent subprocess. |
| A generic CLI JSON schema appended an unwanted second JSON object | Use the actual lesson schema or explicit final-JSON instructions with parser validation; a bare object schema does not describe the lesson. Keep structured model settings when switching providers. |
| A plan exceeded the matrix column count and repeated large native-render instructions in a browser-only request | Send relevant maintained guidance, state renderer bounds including the first object column, retain rejected drafts, and validate a small section before publishing. Do not remove useful comparison dimensions merely to fit an arbitrary limit; check actual text bounds and frames. |
| A source-based plan turned conditional obligations into guaranteed verdicts | Source evidence outranks the storyboard. Preserve qualifiers, relevant conditions and missing facts; distinguish illustrative choices from real eligibility, ownership or compliance decisions. Review the actual visible claims against the cited pages. |
| Regenerating a whole section to fix a qualifier introduced new errors in unrelated licence facts | Make validated text replacements for the flagged claims, preserve accepted geometry and source citations, and run the source audit again. Visual review alone cannot approve factual accuracy. |

Use `scripts/render_review.py` to extract beginning/middle/end frames of each beat
from the actual candidate video. It verifies media metadata and produces contact
sheets with timestamps for review. It does not automatically judge pedagogy.
Record the identified relationship, plausible misreading, and correction before
publishing. Re-run changed scenes, not every accepted example. A skill reduces
recurrence; it cannot guarantee an error-free model or replace artifact review.

## Revision checkpoints must include the feedback and base scene

A schema-valid attempt is not proof that it resolves the current review. The live
pipeline once searched every attempt for a revision/section and reused one made
for earlier findings. Factual redraws could therefore silently restore rejected
geometry without asking the model to apply the new correction. Scope attempt and
completed-section caches to the feedback plus the starting directed section.
Identical requests can reuse their checkpoint; changed feedback or corrected
source facts must reach the model. Test both reuse and invalidation, without
editing a generated lesson to make the test appear successful.
