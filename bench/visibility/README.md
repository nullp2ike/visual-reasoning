# Element visibility benchmark

Measures how accurately vision models answer **"is this element on screen?"**,
under both phrasings the library offers. You supply a dataset — screenshots plus,
for each one, elements the screen is claimed to have and elements it is claimed
to lack — and the harness asks every model under test, several times over.

Each rep makes two calls: elements under `### visible` go through
[`elementsVisible()`](../../src/core/client.ts) ("X is fully visible"), those
under `### absent` through `elementsHidden()` ("X is NOT visible"). Answers are
normalised to a common "is it on screen?" before grading, so every metric means
the same thing in both modes while the leaderboard still shows accuracy split by
prompt — a model sensitive to phrasing rather than to the image shows a gap there.

Grading is **deterministic**. Both templates return one boolean per element, so
an answer is compared with what the ground truth expects. There is no judge,
nothing to calibrate, and no cost beyond the model calls themselves.

The metric that matters most is the **hallucination rate**: how often a model
claims to see something that is not there. A visibility assertion exists to
catch exactly that, and a model that says yes to everything scores a perfect
present-recall while being useless.

## Quick start

```bash
pnpm visibility:run --dataset visibility-example --models claude-haiku-4-5
pnpm visibility:report --dataset visibility-example
```

Then read `bench/results/visibility-example/visibility/RESULTS.md`.

## Ground truth

A dataset is a directory of images plus a `visibility_per_file.md`:

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
  of any prompt. Re-run `visibility:report` alone and the existing runs regrade
  against the corrected answers — no model calls.
- **Rewording, adding, or removing an element, moving one between sections**, or
  changing the image, changes a hash. Those records are reported as stale,
  excluded from the numbers, and re-run on the next `visibility:run`.

## Commands

| Command                  | What it does                                                           |
| ------------------------ | ---------------------------------------------------------------------- |
| `pnpm visibility:run`    | Executes the sweep, one record per (model, image, rep).                |
| `pnpm visibility:report` | Grades every current record and writes `scores.json` and `RESULTS.md`. |

`visibility:run` takes `--dataset`, `--models`, `--images`, `--reps`,
`--effort`, `--fidelity`, `--concurrency`, `--force`, and `--yes` (skip the cost
confirmation). It prints an estimated cost and asks before spending anything.
Runs are resumable: complete cells are skipped and failed cells retried on the
next invocation. As in the screenshot bench, `--models` selects models outright
rather than filtering the roster.

`visibility:report` takes `--dataset` and `--models`.

Unlike the screenshot bench, neither command consults `BENCH_DATASET`: that
variable names a dataset with `issues_per_file.md`, which is usually not a
visibility dataset. Pass `--dataset`, or change `dataset` in
[`visibility.config.ts`](visibility.config.ts).

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

## Output

Everything lands in `bench/results/<dataset-id>/visibility/` (gitignored), beside
the screenshot bench's artifacts for the same dataset rather than mixed into them:

```
runs/<model>/<filename>/rep_N.json   one record per repetition
scores.json                          graded cells + leaderboard metrics
RESULTS.md                           matrix, per-element breakdown, leaderboard
```

## Files

| File                   | Role                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `src/run.ts`           | Sweep CLI.                                                  |
| `src/report.ts`        | Markdown rendering and the report CLI.                      |
| `src/ground-truth.ts`  | Markdown parser, dataset resolution, prompt hashing.        |
| `src/grade.ts`         | Deterministic grading, metrics, leaderboard ordering.       |
| `src/records.ts`       | Record paths, staleness check, record discovery.            |
| `src/types.ts`         | Zod schemas for records, graded cells, metrics, and scores. |
| `visibility.config.ts` | Model roster, repeats, effort, fidelity, concurrency.       |

The example dataset is regenerated with:

```bash
node bench/datasets/visibility-example/generate.mjs bench/datasets/visibility-example
```
