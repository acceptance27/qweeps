# 20-beat generation benchmark

Topic: **How transformer language models learn**  
Target: **20 beats**, sequential runs, same model/provider.

| Run | Status | Beats | Native beats | Lesson duration | Visual generation | Narration |
|---|---:|---:|---:|---:|---:|---:|
| Browser-only (SVG/GSAP) | ready | 20 | 0 | 722.6s | 199.0s (3m 19s) | continuous audio (added in ~110s) |
| Native hybrid (ManimGL) | ready | 20 | 7 | 175.9s | 590.3s (9m 50s) | captions only |

Native was **391.3s slower** (2.97x) for visual generation.

## Phase timings

### Browser-only
```json
{
  "storyboard": 14.522,
  "artwork": 112.394,
  "factual_review": 32.416,
  "narrative_review": 6.966
}
```

Speech synchronization was completed separately (~110s) after fixing the alignment initial-prompt bug.

### Native hybrid
```json
{
  "storyboard": 81.831,
  "artwork": 283.884,
  "native_scene": 211.116,
  "narration_fitting": 10.602
}
```

Native code generation/compilation:
```json
{
  "code_generation": 193.686,
  "compile_and_audit": 17.396
}
```

## Caveats

- Runs were sequential but not started from an identical OS/model cache state.
- The browser-only lesson was reviewed at ~199s and later given continuous narration in a separate ~110s synchronization pass.
- The native lesson was generated with TTS disabled after the long-script alignment failure; it currently plays with captions.
- Browser narration required a fix: the aligner was given the whole lesson script as an initial prompt, which made Whisper skip the opening words of long recordings.

Lessons:
- Browser-only: `http://127.0.0.1:4174/?lesson=e733da0bd0c4ba279b3dc30e1bd5927c`
- Native hybrid: `http://127.0.0.1:4174/?lesson=c292a6f916197a9e83768f53e3bcbd75`
