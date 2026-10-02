# Benchmark datasets

A **dataset** is a directory of screenshots plus ground truth about them. Which
ground-truth file it carries decides which benchmark can use it: [defect
discovery](../discovery/README.md) needs `issues_per_file.md` (what is wrong with
each screenshot) and `prompt.md` (the question put to the models), [assertion accuracy](../assertion/README.md) needs
`assertions_per_file.md` (which elements are there and which are not). One
directory may carry both, and the two benchmarks keep their results apart.

Datasets are tracked, so the ground truth and the runs graded against it are not
one laptop away from being lost. The exception is `private/`: screenshots of a
real product, and the model output quoting them, stay on the machine that
produced them, so it and its results are gitignored.

## Layout

```
bench/datasets/<your-dataset>/
  issues_per_file.md      # required — the ground truth
  prompt.md               # required by discovery — the question every model is asked
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

## The prompt

`prompt.md` is sent to every model verbatim (trailing whitespace aside), so it
holds only the question, with no front matter or comments. Each dataset has
exactly one prompt: to compare two wordings, make two datasets over the same
screenshots, each with its own `prompt.md`, and each gets its own results.
Editing an existing `prompt.md` changes its hash, which invalidates every run
recorded under it.

A prompt may tell models what not to report. Keep any such exclusion list
specific to its dataset: a screen's recurring non-defects in one product are
real defects in another. Derive the list from what models report on the
dataset's negative control — anything reported on a clean screenshot is noise by
definition — and check it against every expected issue before adopting it. Name
as little as possible. On `golden`, a four-category list cut extras per run from
1.89 to 0.28 but also dropped mean recall from 66.8% to 58.1%: the more an
exclusion list names, the more conservative models become beyond it. Its current
prompt names only the two scroll and viewport-edge cases, which were about 84% of
the clean control's noise on their own, framed as features rather than defects.
`private` has its own list; reused on `golden`, it would suppress 4 of the 17
expected defects, because clipping, overlap and alignment are real ground truth
there.

## Selecting a dataset

Precedence, highest first:

1. `--dataset <id-or-path>` on any bench command
2. `BENCH_DATASET=<id-or-path>` in your environment or `.env`
3. `dataset` in [`bench/bench.config.ts`](../bench.config.ts)

A value without a path separator is a directory name under `bench/datasets/`; a
value containing one is a path, so a dataset can live entirely outside the repo:

```bash
pnpm discovery:run --dataset ~/private/checkout-screens
```

## Results are namespaced per dataset

Every artifact for a dataset lands in `bench/results/<dataset-id>/` — manifest,
run records, judge cache, scores, and reports. Image ids are only meaningful
within one dataset, so this is what lets you keep several datasets side by side
without their runs ever mixing.

## Adding a dataset

```bash
mkdir -p bench/datasets/my-set          # add images, issues_per_file.md, prompt.md
BENCH_DATASET=my-set pnpm discovery:run --models claude-haiku-4-5
BENCH_DATASET=my-set pnpm discovery:score
BENCH_DATASET=my-set pnpm discovery:report
```

The manifest is generated on first run and then guarded: adding or removing
images regenerates it automatically (ids stay stable, removed images are
retired), but editing an existing image's bytes or its expected issues
invalidates prior runs and requires `--force`. So does editing `prompt.md`.

## Datasets for the assertion benchmark

The [assertion accuracy benchmark](../assertion/README.md) uses its own ground
truth file, `assertions_per_file.md`, listing for each image the elements that
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
`elementsVisible()` ("X is visible on the page"), `### absent` ones with
`elementsHidden()` ("X is NOT visible"), so a rep makes one call per section.
Elements are sorted within each call, so their order never hints at the expected
answers. A bullet may end with `| TRUE` or `| FALSE` (default `TRUE`) saying
whether its section's claim really holds — that is how a near-miss statement
about an element that does exist is written, and how you keep a call's expected
answers from being uniform. A directory may carry both ground-truth files; the
two benchmarks keep their results apart (`assertion/` and `discovery/` each nest
under the dataset's results directory). Datasets for this
benchmark are selected with `--dataset` or `assertion.config.ts` only —
`BENCH_DATASET` is not consulted, since it usually names a discovery dataset. See
[`bench/assertion/README.md`](../assertion/README.md) for the full grammar.

## The datasets in this repo

| Dataset             | Ground truth             | What it is                                                                                     |
| ------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `golden`  | `issues_per_file.md` + `prompt.md` + `assertions_per_file.md` | 18 screenshots, one seeded defect each plus a clean control, labelled for both benchmarks over one copy of the images. The default for both. |
| `private` | `issues_per_file.md` + `prompt.md`                            | Real product UI. Gitignored and never publishable, so only present on the machine that captured it.                                         |

Adding your own needs no more than a directory, a handful of screenshots, one
`## <filename>` heading each, and at least one clean control for the screenshot
bench. Point a run at it with `--dataset`, by id under this directory or by path
to anywhere on disk.
