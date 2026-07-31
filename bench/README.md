# Visual reasoning benchmark

Measures how reliably vision models spot visual defects in screenshots. You
supply a **dataset** — screenshots plus what is wrong with each one — and the
harness runs every model under test against every screenshot several times,
grades the answers with a judge, and emits a leaderboard, a screenshot × model
matrix, and an interactive HTML report.

Nothing here is specific to any one dataset. See
[`datasets/README.md`](datasets/README.md) for the dataset format; a synthetic
`example` dataset ships with the repo so the pipeline runs on a fresh clone.

## Quick start

```bash
pnpm bench:run --models claude-haiku-4-5 --dataset example
pnpm bench:score --dataset example
pnpm bench:report --dataset example
```

Then open `bench/results/example/report.html`.

Set `BENCH_DATASET` in `.env` to avoid passing `--dataset` every time.

## Commands

| Command                      | What it does                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `pnpm bench:run`             | Executes the sweep and writes one run record per (model, image, rep).        |
| `pnpm bench:score`           | Judges every run against the expected issues and writes a scores file.       |
| `pnpm bench:report`          | Renders `RESULTS.*.md`, `report.*.html`, and the judge comparison.           |
| `pnpm bench:calibrate-embed` | Picks a cosine threshold for the local embedding judge against an LLM judge. |

All four accept `--dataset <id-or-path>`.

`bench:run` also takes `--models`, `--images`, `--prompt <variant>`,
`--effort`, `--fidelity`, `--concurrency`, `--force`, and `--yes` (skip the cost
confirmation). It prints an estimated cost and asks before spending anything.
Runs are resumable: completed cells are skipped, and failed cells are retried on
the next invocation.

`bench:score` and `bench:report` take `--judge <model>`; judge verdicts are
cached, so re-scoring is nearly free.

## Configuration

[`bench.config.ts`](bench.config.ts) holds the roster of models, the number of
repeats, the default dataset, reasoning effort, image fidelity, token budget,
judge, and concurrency. It also defines the **prompt variants** — the exact
questions put to the models. Changing a variant's wording invalidates existing
runs for it (the prompt hash is stamped into every record), which the manifest
guard will tell you about.

## Axes

A run is identified by (model, prompt variant, reasoning effort, image
fidelity). Non-default efforts and fidelities are stored separately and appear
as their own leaderboard rows, e.g. `gpt-5.6-luna (xhigh, high-res)`, so one
model can be compared against itself across settings.

## Judges

The judge is text-only: it never sees the screenshot, only the expected issues
and what the model reported. Either an LLM (`claude-haiku-4-5`, `gpt-5.6-terra`,
…) or a local embedding judge (`embed:bge-small`) that runs offline via
Transformers.js and thresholds cosine similarity. Reports are written per judge
so you can see how much the grading choice moves the ranking.

## Output

Everything lands in `bench/results/<dataset-id>/` (gitignored):

```
manifest.json                    image ids, hashes, expected issues
runs/<variant>/<model>/<img>/    one JSON record per repetition
judge-cache/                     cached judge verdicts
scores.<variant>.<judge>.json    graded cells + leaderboard metrics
RESULTS.<variant>.<judge>.md     markdown leaderboard + matrix
report.<judge>.html              interactive report with per-image drill-down
```

The HTML report links screenshots relative to its own location rather than
inlining them, so it stays small and never embeds your dataset.
