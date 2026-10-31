# Beats 4–8 evidence

Captured from the live player at `?methodsDemo=1&muted=1`:

| beat | chapter | settled | mid-morph |
|---|---|---|---|
| 4 | comparison | `t=8.2` | `t=2.5` |
| 5 | procedure | `t=17.2` | `t=13.1` |
| 6 | algorithm | `t=26.2` | `t=22.1` |
| 7 | narrative | `t=36.2` | `t=31.6` |
| 8 | recall | `t=45.2` | `t=41.1` |

All ten frames returned 0 errors and 0 warnings from the HyperFrames browser
gate. The standalone programs are also visible at `?beats=1`.

Reproduce one frame:

```bash
.venv/bin/python bench/live_scene_check.py \
  --url 'http://127.0.0.1:4174/index.html?methodsDemo=1&muted=1&t=8.2' \
  --out /tmp/opencode/beat-4-settled.json
```
