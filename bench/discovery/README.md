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
and is the default.
See [`../datasets/README.md`](../datasets/README.md) for the format to add your own.

For **video** input — the bugs a model sees in a screen recording — see
[`../video/README.md`](../video/README.md).

## Quick start

```bash
pnpm discovery:run --models claude-haiku-4-5 --dataset golden
pnpm discovery:score --dataset golden
pnpm discovery:report --dataset golden
```

Then open `bench/results/golden/discovery/report.html`.

Set `BENCH_DATASET` in `.env` to avoid passing `--dataset` every time.

## Commands

| Command                 | What it does                                                           |
| ----------------------- | ---------------------------------------------------------------------- |
| `pnpm discovery:run`    | Executes the sweep and writes one run record per (model, image, rep).  |
| `pnpm discovery:score`  | Judges every run against the expected issues and writes a scores file. |
| `pnpm discovery:report` | Renders `RESULTS.*.md`, `report.*.html`, and the judge comparison.     |
| `pnpm discovery:site`   | Builds the read-only static site that GitHub Pages publishes.          |

All three accept `--dataset <id-or-path>`.

`--models` selects models outright rather than filtering the roster, so a
one-off model can be swept without editing `bench.config.ts`.

`discovery:run` also takes `--models`, `--images`, `--effort`, `--fidelity`, `--concurrency`, `--force`, and `--yes` (skip the cost
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
judge, and concurrency.

The question put to the models is not configuration: it belongs to the dataset,
in `bench/datasets/<id>/prompt.md`, sent verbatim. A dataset has exactly one
prompt, so there are no prompt variants. To try a different wording, make a new
dataset directory with its own `prompt.md` — a separate benchmark with its own
results. Editing an existing `prompt.md` invalidates that dataset's runs (the
prompt hash is stamped into every record and the manifest), which the manifest
guard will tell you about.

## Axes

A run is identified by (model, reasoning effort, image fidelity). Non-default efforts and fidelities are stored separately and appear
as their own leaderboard rows, e.g. `gpt-5.6-luna (xhigh, high-res)`, so one
model can be compared against itself across settings.

## Judges

The judge is text-only: it never sees the screenshot, only the expected issues
and what the model reported. It is an LLM (`gpt-6-luna`, `gemini-3.8-flash`,
…). Reports are written per judge so you can see how much the grading choice
moves the ranking; the one named in `judgeModel` (`gpt-6-luna`) also owns the
canonical `RESULTS.md` and `report.html`.

`typesafe/jev-1.13` is a different kind of judge: a decision model that returns
typed answers with probabilities instead of text, called through OpenRouter's
Decisions API with the same `OPENROUTER_API_KEY`. It is asked one Choice
question per reported issue (which expected defect does it describe, or none),
which yields the same verdict as a chat judge: a defect is found when some
reported issue picks it, and an issue that picks none is an extra. It writes no
explanations; each verdict records the probability of the choice and Jev's
calibrated confidence instead, shown as badges in the report's drill-down and
summarised in a "Judge confidence" section listing the least confident
matches beside the defect each was matched to; a toggle adds the least
confident extras, which are often near misses. Decisions below confidence 0.8 are the ones worth checking by hand:
on golden, nearly all of Jev's disagreements with the chat judges, and every
verdict that changed between two identical runs, fell below it. The question
wording lives in `bench/discovery/src/jev.ts` and is versioned by
`JEV_PROMPT_VERSION`, which keys its judge-cache entries.

`openai-decisions/gpt-6-luna` is OpenAI's own Decisions API (public beta,
`gpt-6-luna` only), called directly with `OPENAI_API_KEY`. It is asked Jev's
questions with Jev's options and its answers go through the same verdict logic,
so it differs from Jev only in the model answering. The `openai-decisions/`
prefix is what makes it a decision judge: plain `gpt-6-luna` is the default chat
judge, and the prefix keeps the two apart in judge ids, the cache and results
file names. OpenAI's API has no `state` field, so both issue lists go into the
input text. A refused answer fails the run rather than counting as "none". On
golden it agrees with the chat judges about as closely as Jev does, and 19 of the
20 verdicts where it contradicts all four of them carry a decision below
confidence 0.8. Its input layout is versioned by `OPENAI_DECISIONS_PROMPT_VERSION`
in `bench/discovery/src/openai-decisions.ts`.

```bash
pnpm discovery:score --judge openai-decisions/gpt-6-luna
```

## Output

Everything lands in `bench/results/<dataset-id>/discovery/`:

```
manifest.json          image ids, hashes, expected issues, prompt hash
runs/<model>/<img>/    one JSON record per repetition
judge-cache/           cached judge verdicts
scores.<judge>.json    graded cells + leaderboard metrics
RESULTS.<judge>.md     markdown leaderboard + matrix
report.<judge>.html    interactive report with per-image drill-down
RESULTS.md             copies of the default judge's RESULTS and report
report.html
JUDGE_COMPARISON.md    how the judges disagree, when there are two or more
comparison.html        the same comparison as a page, with a disagreement heatmap
```

`comparison.html` opens with a screenshot × model heatmap of where the judges
disagree. A cell's number is its outvoted found/missed verdicts summed over its
reps: judges on the losing side of a rep's vote, so a 4-1 split adds 1 and a 3-2
split adds 2. Darker cells disagree more, and models are ordered most contested
first. Each cell links to its disagreement below: a rep × judge grid of verdicts
beside the screenshot. Clicking a verdict opens that rep: the clicked judge's
reasoning first, the other judges' verdicts, and what the model reported, with
each issue tagged by the judges that matched it to the defect. Every report's
"comparison" link points here.

## Publishing

The `golden` results are published to GitHub Pages by
[`.github/workflows/pages.yml`](../../.github/workflows/pages.yml) on every push
to `main` that touches them. The workflow runs `pnpm discovery:site`, which
assembles `_site/`:

```
index.html             the default judge's report
report.<judge>.html    every judge's report
comparison.html        the judge comparison, as a page
screenshots/           the dataset images the reports link to
```

The published reports are read-only: the override chips can't be clicked and
the export toolbar is gone, since overrides only mean something to someone
re-grading locally. Only datasets in `PUBLISHABLE_DATASETS` in
`bench/discovery/src/site.ts` can be built, which is just `golden`; the command
ignores `BENCH_DATASET`, so the `private` dataset can never be published by
accident. To preview the site locally:

```bash
pnpm discovery:site
python3 -m http.server --directory _site 8000
```

Pages must be enabled once in the repository settings, with **GitHub Actions**
as the source.

Each report opens on a subset of models: the top `reportDefaultModels` (10) by
`reportRankJudge`'s (`gpt-6-luna`) recall, falling back to `judgeModel` when
that judge has no scores, so every judge's report starts on the same models. The
**Models** button above the matrix opens a dropdown that switches any model on
or off, with shortcuts back to the default, to all, or to none; it applies to
the matrix, the leaderboard, the model detail and the least-confident decisions.
`comparison.html` has the same filter over its heatmap, metric table and
disagreements, recomputing the heatmap totals and hiding screenshots left with
no disagreement. A changed selection is stored for the browser tab and shared
by every report and the comparison page in the same results directory, so it
applies however you get to a page, including the back and forward buttons. It
is not part of the URL, so a filtered view can't be shared as a link.

The HTML report links screenshots relative to its own location rather than
inlining them, so it stays small and never embeds your dataset.
