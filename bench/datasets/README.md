# Benchmark datasets

A **dataset** is a directory of screenshots plus a description of what is wrong
with each one. The benchmark asks every model under test the same question about
every screenshot, then a judge checks the answers against these descriptions.

Everything in this directory is gitignored except `example/`. Screenshots of a
real product, and the model output that quotes them, stay on the machine that
produced them.

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
3. `dataset` in [`bench/bench.config.ts`](../bench.config.ts) (ships as `example`)

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

## The example dataset

`example/` holds five synthetic 480×800 screenshots of a fictional app, four
with one deliberate defect each and one clean control. It exists so `pnpm
bench:run` works on a fresh clone. Regenerate with:

```bash
node bench/datasets/example/generate.mjs bench/datasets/example
```
