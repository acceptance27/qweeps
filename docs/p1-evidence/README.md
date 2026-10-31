# P1 evidence

These are captured runs, not hand-written results.

- `model-scene-muse.json` — Muse, 3 consecutive passes of the route →
  two-card comparison task with the compound criteria contract.
- `model-scene-deepseek.json` — DeepSeek, 3 consecutive passes of the same
  task, same compiler, no hand edits.
- `settled-poster-gate.json` — HyperFrames browser gate on all eight settled
  reference posters (`?posters=1`). Each row is the final poster, not an
  action endpoint; all eight returned 0 errors and 0 warnings.

Reproduce:

```bash
.venv/bin/python bench/model_scene_test.py \
  --model opencode-go/muse-spark-1.3-contributor --attempts 6 \
  --out /tmp/opencode/model-scene-muse.json

.venv/bin/python bench/settled_poster_check.py \
  --out /tmp/opencode/settled-poster-gate.json
```
