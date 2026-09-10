# Assertion accuracy benchmark

**The question: given a specific claim, does the model judge it correctly?**

Nothing here is open-ended. The harness hands a model a list of elements and asks
it to assert something about each one, through both phrasings the library offers,
and the answer is a boolean per element. Grading is a comparison, not a judgement:
there is no judge to run, cache, or calibrate, and no cost beyond the model calls.

You supply a dataset — screenshots plus, for each one, elements the screen is
claimed to have and elements it is claimed to lack. Some claims are true and some
are deliberately false, so a model cannot score by agreeing with everything.

Each rep makes two calls: elements under `### visible` go through
[`elementsVisible()`](../../src/core/client.ts) ("X is visible on the page"),
those under `### absent` through `elementsHidden()` ("X is NOT visible"). Answers
are normalised to a common "is it on screen?" before grading, so every metric
means the same thing in both modes while the leaderboard still shows accuracy
split by prompt — a model sensitive to phrasing rather than to the image shows a
gap there.

The metric that matters most is the **hallucination rate**: how often a model
claims to see something that is not there. That is the failure mode an assertion
in a test suite exists to catch, because it is the one that makes a test pass
when it should fail. A model that says yes to everything scores a perfect
present-recall while being useless.

The sibling benchmark asks the other way round: [defect
discovery](../discovery/README.md) sends one open prompt and lets the model
choose what to report, with a judge grading the prose. See
[`../README.md`](../README.md) for the side-by-side.

> **On the names:** the harness, its commands, and its ground-truth file are
> named for what they measure — assertion accuracy. `assertions_per_file.md`
> dropped the older `visibility_` prefix because its contents outgrew it: roughly
> half the bullets assert a defect category ("Invalid values", "Inconsistent
> application state issues") rather than the presence of an element. The internal
> types keep the `Visibility*` prefix (`VisibilityImage`, `visibilityPromptHash`)
> because they model what the two prompts ask about, which is still visibility.

## Quick start

```bash
pnpm assertion:run --dataset golden --models claude-haiku-4-5
pnpm assertion:report --dataset golden
```

Then read `bench/results/golden/assertion/RESULTS.md`, or open `report.html`
beside it. `golden` carries both benchmarks' ground truth over one copy of the
screenshots — `assertions_per_file.md` is this one's; see
[`../datasets/README.md`](../datasets/README.md) for what it contains.

## Ground truth

A dataset is a directory of images plus a `assertions_per_file.md`:

```markdown
## orbit_home.png

### visible

- The "Orbit" app title in the header
- The "Orbit" chewing gum logo in the header | FALSE

### absent

- A settings gear icon in the header
- A red notification badge with a count on the Alerts tab
```

- The `##` heading must match the image filename exactly.
- The **section chooses the prompt**: `### visible` bullets are asked with
  `elementsVisible()`, `### absent` bullets with `elementsHidden()`. Either
  section may be omitted (only one call is then made), but an image needs at
  least one element in total.
- Elements are **sorted within each call**, so their order carries no hint about
  which answers are expected.
- Phrase absent elements as things the UI plausibly _could_ have. "A shopping
  cart icon" tests something; "a photograph of a giraffe" does not.
- Anything ambiguous is rejected rather than guessed: an unknown sub-heading, a
  bullet outside a section, a duplicate filename, or an element in both lists is
  an error naming the line.

### Truth flags

A bullet may end with `| TRUE` or `| FALSE`, stating whether its section's claim
actually holds for that element. The flag is optional and defaults to `TRUE`, so
a file without any keeps its original meaning. `| FALSE` inverts the section:

| Bullet                                    | Section   | Model should answer |
| ----------------------------------------- | --------- | ------------------- |
| `- A search bar`                          | `visible` | visible             |
| `- The "Orbit" chewing gum logo \| FALSE` | `visible` | not visible         |
| `- A settings gear icon`                  | `absent`  | not visible         |
| `- A search bar \| FALSE`                 | `absent`  | visible             |

This is how you write a **near-miss statement**: the header really does contain
an "Orbit" title, but not an "Orbit chewing gum logo", so the second row above
tests whether a model reads the element description carefully instead of pattern
matching on the word it recognises. Such an element is graded and counted like
any other not-visible element, and the per-element table marks it
`(marked false)` so you can tell the near misses from the plainly absent ones.

The flag is parsed off the end of the bullet and **never sent to the model** —
only the description is. So toggling a flag, like moving a bullet between the two
sections, regrades existing runs with no model calls. A description that itself
contains a pipe is safe: only a trailing `| TRUE` or `| FALSE` is read as a flag,
so `- A | B toggle` and `- A | B toggle | FALSE` both work. `TRUE` and `FALSE`
are case-insensitive and the spacing around the pipe is free.

Note that partial visibility fails in both directions. The library's prompt
treats an element cut off by the screenshot boundary as neither fully visible
nor hidden, so keep ground-truth elements clear of the edges.

## Re-labelling vs. rewording

Every run record stores the image hash and a hash of the prompt actually sent.

- **Toggling a truth flag** changes neither hash, because the flag is not part
  of any prompt. Re-run `assertion:report` alone and the existing runs regrade
  against the corrected answers — no model calls.
- **Rewording, adding, or removing an element, moving one between sections**, or
  changing the image, changes a hash. Those records are reported as stale,
  excluded from the numbers, and re-run on the next `assertion:run`.

## Commands

| Command                 | What it does                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `pnpm assertion:run`    | Executes the sweep, one record per (model, image, rep).                               |
| `pnpm assertion:report` | Grades every current record and writes `scores.json`, `RESULTS.md` and `report.html`. |

`assertion:run` takes `--dataset`, `--models`, `--images`, `--reps`,
`--effort`, `--fidelity`, `--no-correct-rendering`, `--concurrency`, `--force`, and `--yes` (skip the cost
confirmation). It prints an estimated cost and asks before spending anything.
Runs are resumable: complete cells are skipped and failed cells retried on the
next invocation. As in the discovery bench, `--models` selects models outright
rather than filtering the roster.

`elementsVisible()` judges rendering quality by default here, so an element that
is present but unreadable, overlapping or misaligned counts as a failure. That is
the bench default even though the library ships the option off, because the whole
point of this dataset is seeded rendering defects. `--no-correct-rendering` opts
out for a pure presence check; those records land under `<model>@presence/` and
grade as their own `(presence-only)` series, so both can coexist if you ever want
the comparison.

`assertion:report` takes `--dataset` and `--models`.

Unlike the discovery bench, neither command consults `BENCH_DATASET`: that
variable names a dataset with `issues_per_file.md`, which is usually not a
visibility dataset. Pass `--dataset`, or change `dataset` in
[`assertion.config.ts`](assertion.config.ts).

## Metrics

| Column             | Meaning                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accuracy**       | Correct answers over every element of every successful run. Primary ranking column.                                                                     |
| **Present recall** | Share of on-screen elements the model confirmed. Misses mean it overlooked something.                                                                   |
| **Absent acc.**    | Share of off-screen elements the model correctly denied.                                                                                                |
| **Halluc.**        | 1 − absent accuracy. How often it claimed to see something that is not there.                                                                           |
| **Visible prompt** | Accuracy over elements asked with `elementsVisible()`.                                                                                                  |
| **Hidden prompt**  | Accuracy over elements asked with `elementsHidden()`. A wide gap to the column above means the model is sensitive to phrasing rather than to the image. |
| **All-correct**    | Share of runs where every element of an image was right. Stricter than accuracy.                                                                        |
| **Flakiness**      | Share of (image, element) pairs answered inconsistently across reps.                                                                                    |
| **Text mism.**     | Answers whose returned statement did not echo the element text. Diagnostic only.                                                                        |
| **Invalid**        | Calls whose response could not be matched to the elements sent (wrong statement count).                                                                 |

A rep is graded as a whole, so if either of its two calls fails the rep counts as
failed. Failed and invalid reps shrink the denominator rather than counting as
wrong, so a provider outage never looks like a model getting worse. Cost, tokens
and latency are summed across a rep's calls, so those columns stay per-rep.

## The consistency grid

`report.html` is self-contained: scores are inlined, screenshots are linked
relative to the page, and nothing is fetched from the network. Alongside the
leaderboard and the image-by-model matrix it carries a **consistency grid** —
one row per (image, element), one column per model, each cell counting the reps
that answered correctly.

That count is the reason to run several reps. A cell reading `5/5` or `0/5` is a
settled answer, right or wrong. A cell reading `3/5` is the model disagreeing
with itself on identical input, which no average and no single-rep run will show
you. Those cells are shaded amber, and the filters narrow the grid to rows with
any wrong answer, rows that are inconsistent, or rows asked with the
`elementsHidden` prompt. Clicking any cell shows every rep's answer and the
model's own reasoning next to the screenshot.

Use it to audit ground truth as well as models: a row where every model is
confidently wrong in every rep is usually a mislabelled or badly worded bullet
rather than a shared blind spot.

## The per-statement pivot

Both reports also carry a **per-statement pivot**: one row per bullet wording,
one column per model, each cell counting the _files_ in which that wording drew
at least one wrong answer. Where the grid asks "how did this element do on this
image?", the pivot asks "how does this wording do everywhere it appears?" — the
question behind a ground-truth audit. A bullet failing across many files is
almost always the wording rather than the models; one failing on a single file
is the model, or that file's label. Rows are sorted worst first, and in the
HTML clicking a cell lists the failing files with their rep counts.

## Output

Everything lands in `bench/results/<dataset-id>/visibility/`, beside
the discovery bench's artifacts for the same dataset rather than mixed into them:

```
runs/<model>/<filename>/rep_N.json   one record per repetition
scores.json                          graded cells + leaderboard metrics
RESULTS.md                           matrix, per-element breakdown, leaderboard
report.html                          the same, interactive, plus the pivot and consistency grid
```

## Files

| File                  | Role                                                        |
| --------------------- | ----------------------------------------------------------- |
| `src/run.ts`          | Sweep CLI.                                                  |
| `src/report.ts`       | Markdown rendering and the report CLI.                      |
| `src/ground-truth.ts` | Markdown parser, dataset resolution, prompt hashing.        |
| `src/grade.ts`        | Deterministic grading, metrics, leaderboard ordering.       |
| `src/records.ts`      | Record paths, staleness check, record discovery.            |
| `src/types.ts`        | Zod schemas for records, graded cells, metrics, and scores. |
| `assertion.config.ts` | Model roster, repeats, effort, fidelity, concurrency.       |
