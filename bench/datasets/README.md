# Benchmark datasets

A **dataset** is a directory of screenshots plus a description of what is wrong
with each one. The benchmark asks every model under test the same question about
every screenshot, then a judge checks the answers against these descriptions.

Datasets are tracked, so the ground truth and the runs graded against it are not
one laptop away from being lost. The exception is `primary/`: screenshots of a
real product, and the model output quoting them, stay on the machine that
produced them, so it and its results are gitignored.

## Layout

```
bench/datasets/<your-dataset>/
  issues_per_file.md      # required — the ground truth
  login_broken.png        # any number of images
  cart_empty.png
```

`issues_per_file.md` maps each filename to the defects a model is expected to
report for it:

```markdown
## login_broken.png

- The "Sign in" button has no label text.
- The password field overlaps the email field.

## cart_empty.png

-
```

- The `##` heading must match the image filename exactly.
- Each `-` bullet is one expected issue, phrased as a person would describe it.
  The judge matches a model's reported issues against these semantically, so
  wording matters more than formatting.
- A heading followed by a single empty bullet is a **negative control**: the
  screenshot is clean, and anything the model reports there is counted as a
  false positive. Include at least one.
- Images not listed in `issues_per_file.md` are ignored, so scratch files in the
  directory are harmless.

Filenames never reach a model. Each image is assigned an anonymous `img_NN` id
in the manifest, and only the bytes are sent — a model can't infer the answer
from a name like `login_broken.png`.

## Selecting a dataset

Precedence, highest first:

1. `--dataset <id-or-path>` on any bench command
2. `BENCH_DATASET=<id-or-path>` in your environment or `.env`
3. `dataset` in [`bench/bench.config.ts`](../bench.config.ts)

A value without a path separator is a directory name under `bench/datasets/`; a
value containing one is a path, so a dataset can live entirely outside the repo:

```bash
pnpm bench:run --dataset ~/private/checkout-screens
```

## Results are namespaced per dataset

Every artifact for a dataset lands in `bench/results/<dataset-id>/` — manifest,
run records, judge cache, scores, and reports. Image ids are only meaningful
within one dataset, so this is what lets you keep several datasets side by side
without their runs ever mixing.

## Adding a dataset

```bash
mkdir -p bench/datasets/my-set          # add images + issues_per_file.md
BENCH_DATASET=my-set pnpm bench:run --models claude-haiku-4-5
BENCH_DATASET=my-set pnpm bench:score
BENCH_DATASET=my-set pnpm bench:report
```

The manifest is generated on first run and then guarded: adding or removing
images regenerates it automatically (ids stay stable, removed images are
retired), but editing an existing image's bytes or its expected issues
invalidates prior runs and requires `--force`.

## Visibility datasets

The [element visibility benchmark](../visibility/README.md) uses its own ground
truth file, `visibility_per_file.md`, listing for each image the elements that
are on screen and plausible elements that are not:

```markdown
## orbit_home.png

### visible

- The "Orbit" app title in the header
- The "Orbit" chewing gum logo in the header | FALSE

### absent

- A settings gear icon in the header
```

The section chooses the prompt: `### visible` elements are asked with
`elementsVisible()` ("X is fully visible"), `### absent` ones with
`elementsHidden()` ("X is NOT visible"), so a rep makes one call per section.
Elements are sorted within each call, so their order never hints at the expected
answers. A bullet may end with `| TRUE` or `| FALSE` (default `TRUE`) saying
whether its section's claim really holds — that is how a near-miss statement
about an element that does exist is written, and how you keep a call's expected
answers from being uniform. A directory may carry both ground-truth
files; the two harnesses keep their results apart (`visibility/` nests under the
dataset's results directory). Visibility datasets are selected with `--dataset`
or `visibility.config.ts` only — `BENCH_DATASET` is not consulted, since it
usually names a screenshot dataset. See
[`bench/visibility/README.md`](../visibility/README.md) for the full grammar.

## The datasets in this repo

| Dataset             | Ground truth             | What it is                                                                                     |
| ------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `golden`            | `issues_per_file.md`     | 18 screenshots, one seeded defect each plus a clean control. Default for the screenshot bench. |
| `visibility-golden` | `visibility_per_file.md` | The same screens, labelled element by element for the visibility bench.                        |
| `primary`           | `issues_per_file.md`     | Private product UI. Gitignored, so only present on the machine that captured it.               |

Adding your own needs no more than a directory, a handful of screenshots, one
`## <filename>` heading each, and at least one clean control for the screenshot
bench. Point a run at it with `--dataset`, by id under this directory or by path
to anywhere on disk.
