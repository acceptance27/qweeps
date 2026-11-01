# Handcrafted-art model test

The model writes the diagram primitives directly; it does not select a motif.
`src/assistant/visual/handart.py` enforces normalized 0–100 coordinates, a small
shape vocabulary, palette colors, path commands and text bounds.

## Test

One massless-matter scene, authored by **Muse Spark 1.3 Contributor**:

- first pass, no repair
- **20.7 s**
- browser gate: **0 errors, 0 warnings**

Open `?handartModel=1`.

The generated scene contains a hand-drawn wave packet with arrow, a triangle
for the invariant relation, a boxed wave for confined rest mass, and attached
labels.

## Limits

- one scene only;
- the model still receives the reference facts;
- paths are bounded but can still be visually crude;
- no audio;
- no automated aesthetic review beyond the browser gate.
