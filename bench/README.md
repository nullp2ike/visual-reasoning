# Benchmarks

Two benchmarks live here, and they answer different questions. Both run the same
models against the same screenshots; what differs is who does the asking.

|                     | [Defect discovery](discovery/README.md)                              | [Assertion accuracy](assertion/README.md)                                  |
| ------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **The question**    | Given no hints, does the model find the defects we seeded?           | Given a specific claim, does the model judge it correctly?                 |
| **What is sent**    | One open prompt: "What looks visually broken on this page?"          | A list of elements, asked through `elementsVisible()` / `elementsHidden()` |
| **The answer**      | Free prose — a list of issues the model chose to report              | One boolean per element                                                    |
| **Grading**         | An LLM (or embedding) judge matches reported issues to expected ones | Deterministic — the boolean is compared with the ground truth              |
| **Ground truth**    | `issues_per_file.md` — what is wrong with each screenshot            | `visibility_per_file.md` — which elements are there, and which are not     |
| **Headline metric** | Recall of seeded defects, against extras reported per run            | Accuracy, and the hallucination rate inside it                             |
| **Fails when**      | The model overlooks a defect, or invents defects on a clean page     | The model agrees with a claim that is false                                |
| **Commands**        | `pnpm discovery:run` → `:score` → `:report`                          | `pnpm assertion:run` → `:report`                                           |
| **Results**         | `results/<dataset>/`                                                 | `results/<dataset>/assertion/`                                             |

The short version: **discovery measures what a model notices when nobody points
at anything; assertion measures whether it will tell you the truth about
something you pointed at.** A model can be strong at one and weak at the other,
and the two failure modes cost a test suite differently — a missed defect is a
bug that ships, while a false assertion is a test that passes when it should not.

Neither replaces the other, and neither shares a leaderboard with the other.

For **video** input — asking a model to list the bugs it sees in a screen
recording — see [`video/README.md`](video/README.md). It is discovery-shaped
(open prompt, free-prose answer) but has no judge yet.

## Layout

```
bench/
  bench.config.ts       models, repeats, effort, fidelity — shared by both benchmarks;
                        also the discovery prompt variants and its judge
  shared/               dataset resolution and small helpers both benchmarks use
  discovery/            the defect-discovery benchmark
  assertion/            the assertion-accuracy benchmark
  video/                the video bug-hunting harness
  datasets/             ground truth and screenshots (see datasets/README.md)
  results/              per-dataset artifacts, namespaced by benchmark
```

Nothing in either benchmark is specific to one dataset. `golden` (18 screenshots,
one seeded defect each plus a clean control) and `visibility-golden` (the same
screens, labelled element by element) are tracked; `primary` is private product
UI and gitignored. See [`datasets/README.md`](datasets/README.md) to add your own.
