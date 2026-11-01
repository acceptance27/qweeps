# Model beat factory evidence

There are two live paths:

- `?factory=1` — model fills `LiveVisual` slots; the existing `GeneratedStage`
  renderer draws the cards. This is the Module 6 / massless-lesson design.
- `?methodsVisual=1` — the 1:1 reference lesson: diagram/concept beats 1–3,
  comparison/process/timeline/loci beats 4–8.

`visual-beats.jsonl` is the latest visual factory stream: **5/5 first-pass**,
**22.8 s total**, first beat **4.5 s**. The five rendered tiles passed the live
browser gate **5/5, 0 errors, 0 warnings**.

The older compound/SceneProgram factory is retained for motion-specific scenes,
not for these card beats.

Latest UI run:

| beat | time | try | result |
|---|---|---|---|
| comparison | 5.7 s | 1 | pass |
| procedure | 9.6 s | 2 | pass after one repair |
| algorithm | 6.2 s | 1 | pass |
| narrative | 6.1 s | 1 | pass |
| recall | 7.3 s | 1 | pass |

Total: **35 s**; first beat: **5.7 s**. The model-authored SVG for every tile
passed the live browser gate: **5/5, 0 errors, 0 warnings**.

A clean CLI run with the same code:

| beat | time | try |
|---|---|---|
| comparison | 5.6 s | 1 |
| procedure | 5.0 s | 1 |
| algorithm | 7.0 s | 1 |
| narrative | 5.5 s | 1 |
| recall | 5.4 s | 1 |

Total: **28.5 s**, all first pass. The spread is model latency.

Every grammar now uses a motion recipe rather than a generic reveal:
comparison hull split, procedure rail, algorithm highlight sweep, narrative
travel dot, recall route. The old 4–8 are the motion reference.

Reproduce:

```bash
.venv/bin/python bench/beat_factory_stream.py \
  --out /tmp/opencode/beat-factory.jsonl
```
