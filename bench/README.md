# Benchmark tooling

Phase 0 artifacts for the v3 plan.

## Run a lesson

Start the visual server with a per-run call log:

```bash
QWEEPS_CALL_LOG=bench/runs/<label>/calls.jsonl python -m assistant.visual.server
```

Then:

```bash
python bench/run_lesson.py <label> "How do LLMs work?" \
  --base http://127.0.0.1:4174/api/visual \
  --calls-log bench/runs/<label>/calls.jsonl \
  --mode ask --clock synthetic \
  --model opencode-go/deepseek-v4.1-flash
```

Outputs `result.json` (raw) and `benchmark.json` (telemetry row).

## Judge

`bench/judge.py` provides `blind_scene()` (strips generator identity and
self-review metadata) and `judge(scene, chat)` returning
`{approved, blockers, advisories}`. Frames are added once `compileBeat` and
frame capture exist.

## Rules

- Runs are sequential; concurrent runs distort timings.
- `mode` and `clock` are recorded on every row.
- The judge model is recorded (`judge_model`) and is currently also a contender,
  so cross-model quality claims are directional.
