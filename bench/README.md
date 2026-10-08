# Benchmarks

The benchmark here is [defect discovery](discovery/README.md): **given no hints,
does the model find the defects we seeded?** Every model gets one open prompt —
"What looks visually broken on this page?" — and answers in free prose. An LLM
judge matches what it reported against `issues_per_file.md`, the dataset's list
of what is wrong with each screenshot. The headline metric is recall of the
seeded defects, weighed against the extras a model reports on screens that are
fine.

| Step   | Command                 | Writes                          |
| ------ | ----------------------- | ------------------------------- |
| Sweep  | `pnpm discovery:run`    | one run record per call         |
| Grade  | `pnpm discovery:score`  | `scores.<judge>.json`           |
| Report | `pnpm discovery:report` | `RESULTS.*.md`, `report.*.html` |

Results land in `results/<dataset>/discovery/`.

For **video** input — asking a model to list the bugs it sees in a screen
recording — see [`video/README.md`](video/README.md). It is discovery-shaped
(open prompt, free-prose answer) but has no judge yet.

## Layout

```
bench/
  bench.config.ts       models, repeats, effort, fidelity, and the discovery judge
  shared/               dataset resolution and small helpers
  discovery/            the defect-discovery benchmark
  video/                the video bug-hunting harness
  datasets/             ground truth and screenshots (see datasets/README.md)
  results/              per-dataset artifacts, namespaced by benchmark
```

Nothing in the benchmark is specific to one dataset. `golden` (18 screenshots,
one seeded defect each plus a clean control) is tracked and is the default. See
[`datasets/README.md`](datasets/README.md) to add your own.
