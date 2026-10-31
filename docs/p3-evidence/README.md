# P3 live scene evidence

Captured from the real live player, not the standalone poster route.

- `live-scene-mid.json` — `?sceneDemo=1&muted=1&t=2.2`, mid-construction.
- `live-scene-settled.json` — `?sceneDemo=1&muted=1&t=8.4`, settled scene.
- `live-card.json` — `?sceneDemo=1&muted=1&t=16.8`, card chapter after the
  scene on the same lesson clock.

All three returned 0 errors and 0 warnings from the HyperFrames browser gate.

Reproduce:

```bash
.venv/bin/python bench/live_scene_check.py \
  --url 'http://127.0.0.1:4174/index.html?sceneDemo=1&muted=1&t=8.4' \
  --out /tmp/opencode/live-scene-settled.json
```
