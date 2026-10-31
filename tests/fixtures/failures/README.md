# Failure corpus (frozen)

Historical artifacts from the 2026-10-30 "How do LLMs work?" benchmark. These are
regression fixtures, not expected-output snapshots: they record how the pipeline
failed before v3.

- `manifest.json` — run summaries, artifact paths, failure classes, and the
  historical pre-artifact attempts.
- `runs/*.json` — the raw request/response records captured by the benchmark
  driver (`http`, `wallSeconds`, `error`).
- `calls/*.jsonl` — per-model-call telemetry (`time`, `model`, `seconds`,
  `inputChars`, `outputChars`, `images`, `ok`, `error`).

## Rules

1. Do not regenerate or "fix" these files. They are the frozen baseline.
2. Every defect class A–E in `docs/v3-compilebeat-architecture.md` must appear
   at least once; `tests/test_failure_corpus.py` enforces it.
3. New failures get a new run entry and, if they represent a new class, a new
   named test — not an edit to an existing fixture.
4. The judge was `opencode-go/deepseek-v4.1-flash`, which is also a contender.
   DeepSeek runs are therefore self-judged; treat cross-model quality
   comparisons as directional.

## Failure classes

| class | meaning |
|---|---|
| A | contract/omission |
| B | long-prompt capability cliff |
| C | spatial/encoding construction |
| D | teaching sequence/scaffolding |
| E | harness defect |
