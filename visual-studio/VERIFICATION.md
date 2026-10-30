# Local verification, 2026-10-27

- Python suite: 248 passed. Frontend suite: 14 passed. TypeScript and Vite build passed.
- Native runtime: actual ManimGL/OpenGL on NVIDIA GTX 1660 Ti, 1280×720.
  A seek from 73s to 25s and back reconstructed an identical JPEG hash.
  Sampled steady frames took about 28–40ms; first visits/shader warmup took longer.
  These are local samples, not a guaranteed playback frame rate.
- Browser Fish playback: paused the same MP3 at 11.756s, resumed at 12.021s.
  Final-build repeat: 3.781s paused → 4.056s playing. The clip URL stayed unchanged.
  Unit coverage also checks cancellation during synthesis, clip reuse and a question
  interrupting lesson audio without losing its saved playhead.
- Real question branch through the configured model fallback selected native chapter 3
  with cache disabled. The computed hypothetical value changed from $1.893 to about
  $23.00. Return restored 73s, cache enabled and the selected category.
- Native selection outlines were inspected in the browser while paused. Browser delivery
  uses individually cache-busted JPEG frames, because the multipart path deferred painting
  its final frame on this host. Geometry and highlight outlines are rendered by ManimGL.
- The five narrated examples repackaged successfully with review/fingerprint checks;
  accepted Python, ALU and world-generation scene sources were preserved.

Limits: new production branches choose reviewed native representations and bounded
parameters. Generic generated plans still use the existing primitive SVG compiler.
The numeric production report covers earlier completed work and excludes this profiling
lesson. Dollar values are a hypothetical model token-value calculation, not an invoice.
