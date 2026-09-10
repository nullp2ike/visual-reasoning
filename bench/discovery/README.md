# Defect discovery benchmark

**The question: given no hints, does the model find the defects we seeded?**

Every model under test gets one open prompt — "What looks visually broken on this
page?" — and answers in free prose. A judge then matches what it reported against
what the dataset says is wrong with that screenshot. Nothing points the model at
anything, so this measures what it notices on its own: recall of the seeded
defects, weighed against the extras it reports on screens that are fine.

You supply a **dataset** — screenshots plus what is wrong with each one — and the
harness runs every model against every screenshot several times, grades the
answers, and emits a leaderboard, a screenshot × model matrix, and an interactive
HTML report.

`golden` (18 screenshots, one seeded defect each plus a clean control) is tracked
and is the default; the `primary` dataset is gitignored, being private product UI.
See [`../datasets/README.md`](../datasets/README.md) for the format to add your own.

The sibling benchmark asks the opposite way round: [assertion
accuracy](../assertion/README.md) hands the model a specific claim about a
specific element and checks whether it judges it correctly, with no judge and no
prose in between. A model good at one is not automatically good at the other —
see [`../README.md`](../README.md) for the side-by-side.

For **video** input — the bugs a model sees in a screen recording — see
[`../video/README.md`](../video/README.md).

## Quick start

```bash
pnpm discovery:run --models claude-haiku-4-5 --dataset golden
pnpm discovery:score --dataset golden
pnpm discovery:report --dataset golden
```

Then open `bench/results/golden/report.html`.

Set `BENCH_DATASET` in `.env` to avoid passing `--dataset` every time.

## Commands

| Command                          | What it does                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm discovery:run`             | Executes the sweep and writes one run record per (model, image, rep).        |
| `pnpm discovery:score`           | Judges every run against the expected issues and writes a scores file.       |
| `pnpm discovery:report`          | Renders `RESULTS.*.md`, `report.*.html`, and the judge comparison.           |
| `pnpm discovery:calibrate-embed` | Picks a cosine threshold for the local embedding judge against an LLM judge. |

All four accept `--dataset <id-or-path>`.

`--models` selects models outright rather than filtering the roster, so a
one-off model can be swept without editing `bench.config.ts`.

`discovery:run` also takes `--models`, `--images`, `--prompt <variant>`,
`--effort`, `--fidelity`, `--concurrency`, `--force`, and `--yes` (skip the cost
confirmation). It prints an estimated cost and asks before spending anything.
Runs are resumable: completed cells are skipped, and failed cells are retried on
the next invocation.

`discovery:score` also takes `--models` (same explicit-selection semantics as
`discovery:run`), so records for a model kept out of the roster can still be scored.

`discovery:score` and `discovery:report` take `--judge <model>`; judge verdicts are
cached, so re-scoring is nearly free.

## Configuration

[`bench.config.ts`](../bench.config.ts) holds the roster of models, the number of
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
so you can see how much the grading choice moves the ranking; the one named in
`judgeModel` (`gpt-5.6-luna`) also owns the canonical `RESULTS.md` and
`report.html`.

## Output

Everything lands in `bench/results/<dataset-id>/`:

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
