# Model beat factory evidence

`?factory=1` starts the streaming factory. The page opens five tiles and fills
them as each beat passes the compiler.

Latest UI run:

| beat | time | try | result |
|---|---|---|---|
| comparison | 8.0 s | 1 | pass |
| procedure | 6.9 s | 1 | pass |
| algorithm | 4.9 s | 1 | pass |
| narrative | 16.3 s | 1 | pass |
| recall | 20.7 s | 1 | pass |

Total: **56.8 s** for five beats. The model-authored SVG for every tile also
passed the live browser gate: **5/5, 0 errors, 0 warnings**.

`beat-factory-final.jsonl` is a clean CLI run with the same code:

| beat | time | try |
|---|---|---|
| comparison | 20.4 s | 1 |
| procedure | 19.0 s | 1 |
| algorithm | 29.5 s | 1 |
| narrative | 9.6 s | 1 |
| recall | 25.3 s | 1 |

Total: **103.8 s**. The spread is model latency, not pipeline failure. Every
beat is below one minute.

Reproduce:

```bash
.venv/bin/python bench/beat_factory_stream.py \
  --out /tmp/opencode/beat-factory.jsonl
```
