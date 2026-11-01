# Motif layer model test

The model selects semantic motifs; `src/assistant/visual/motifs.py` expands
them into primitives for `DiagramArtwork`. The model never writes paths or
pixel coordinates.

## Test

Four diagram beats based on the massless-matter reference facts:

| beat | time | nodes |
|---|---|---|
| Light carries energy and momentum | 7.8 s | 3 |
| The single-photon impossibility | 8.5 s | 3 |
| Canceling momentum at threshold | 7.4 s | 4 |
| Materializing the pair | 8.9 s | 3 |

Total: **32.7 s**, **4/4 first-pass**. Browser gate on all four:
**4/4, 0 errors, 0 warnings**.

Run:

```bash
.venv/bin/python bench/motif_model_test.py \
  --out visual-studio/public/lessons/motif-model.json
```

Open `?motifModel=1`.

## Motif vocabulary

`wave`, `vector`, `box`, `ring`, `pair`, `axis`, `collision`, `field`,
`equation`.

## Cross-model runs

Same four beats, same schema, same browser gate:

| model | total | beats | gate |
|---|---|---|---|
| Claude Haiku 5.5 | 35.5 s | 8.3 / 9.6 / 9.0 / 8.5 s | 4/4, 0/0 |
| GPT-6 Luna | 37.3 s | 8.8 / 9.1 / 10.7 / 8.7 s | 4/4, 0/0 |

Both models passed all four beats first-pass. Screenshots:
`haiku-chapter-1.png`, `luna-chapter-1.png`.

## Limits

- The motif artwork is simpler than the hand-authored massless reference.
- Four-node diagrams use the 3-top + 1-bottom layout.
- Diagram motion is reveal-only; the model does not author motion paths yet.
- Audio is still separate.
