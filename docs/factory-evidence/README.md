# Model beat factory evidence

The card beats use the existing `LiveVisual` renderer, not the compound
`SceneProgram` cards.

- `?factory=1` — model fills LiveVisual nodes/cells; `GeneratedStage` draws
  the Module 6 / massless-lesson design.
- `?methodsVisual=1` — the hand-authored 1:1 reference:
  - beats 1–3: `diagram` / `fanin` / `concept`
  - beat 4: `matrix` comparison
  - beat 5: `process` procedure
  - beat 6: `matrix` algorithm
  - beat 7: `timeline` narrative
  - beat 8: `loci` recall

## Latest streaming run

| beat | layout | time | try |
|---|---|---|---|
| comparison | matrix | 6.5 s | 1 |
| procedure | process | 6.2 s | 1 |
| algorithm | matrix | 5.3 s | 1 |
| narrative | timeline | 5.4 s | 1 |
| recall | loci | 4.2 s | 1 |

Total: **27.7 s**; first beat: **6.5 s**.

A clean CLI run finished in **26.1 s**, first beat **6.2 s**, all first-pass.

The five rendered model beats passed the live browser gate:
**5/5, 0 errors, 0 warnings**.

Reference screenshots:

- `reference-comparison.png`
- `reference-procedure.png`
- `reference-algorithm.png`

`visual-beats.jsonl` is the clean CLI stream.

Reproduce:

```bash
.venv/bin/python bench/beat_factory_stream.py \
  --out /tmp/opencode/visual-beats.jsonl
```
