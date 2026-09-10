# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **One dataset now carries both benchmarks' ground truth.** `golden` and `visibility-golden` held the same 18 screenshots — byte-identical, all 18 checksums matching — differing only in which ground-truth file sat beside them, so 13 MB of images was committed twice and a fix to one copy would silently diverge from the other. They are merged: `bench/datasets/golden/` now holds one copy of the images plus both `issues_per_file.md` (discovery) and `visibility_per_file.md` (assertion), which is the shape `assertDatasetHasFile(dataset, requiredFile)` was parameterised for all along. Assertion artifacts moved to `bench/results/golden/assertion/`, beside discovery's at the dataset root, so both benchmarks' verdicts on one screen sit under one dataset id — "found the defect 5/5 but will not assert the element is missing" is now one directory away instead of two. Every existing run record stayed valid and nothing was re-run: records are keyed by `imageSha256` and `promptHash`, neither of which a directory move touches, and the regenerated report grades the same 13 series over the same 1,170 cells with identical numbers. `assertionBenchConfig.dataset` is `golden`; it stays a separate field from `benchConfig.dataset` because `BENCH_DATASET=primary` names a discovery-only dataset and must not reach an assertion run.
- **The two benchmarks are now named and separated by the question they answer.** `bench/` held a benchmark called "visual reasoning" and one called "element visibility" — names describing a topic and a mechanism rather than what either measures, which made it easy to read leaderboard numbers from one as though they meant the other. They are now **defect discovery** (`pnpm discovery:run` → `:score` → `:report`, in `bench/discovery/`): one open prompt, "What looks visually broken on this page?", free-prose answer, judge-graded, headline metric recall of seeded defects against extras per run — and **assertion accuracy** (`pnpm assertion:run` → `:report`, in `bench/assertion/`): a specific claim per element through `elementsVisible()` / `elementsHidden()`, one boolean each, graded by comparison with no judge, headline metric accuracy and the hallucination rate inside it. Discovery measures what a model notices when nobody points at anything; assertion measures whether it tells the truth about something you pointed at, and the failure modes cost a suite differently — a missed defect ships a bug, a false assertion ships a test that passes when it should fail. [`bench/README.md`](./bench/README.md) is now a router carrying the side-by-side table, and each benchmark's README opens with its own question. The two modules both harnesses use (dataset resolution and small helpers) moved to `bench/shared/`, so neither benchmark imports the other. Assertion artifacts moved from `results/<dataset>/visibility/` to `results/<dataset>/assertion/`; discovery's stay at the dataset results root. Report titles, HTML headings, and every "re-run this command" message follow the new names. `visibility_per_file.md` keeps its filename and the assertion harness keeps its `Visibility*` types: the harness is named for what it measures, its internals for what it asks about. Nothing under `src/` changed — this is bench tooling only, and no published API moved.

## [0.23.0] - 2026-09-10

### Added

- **GLM 5.3 Flash (`z-ai/glm-5.3-flash`)** as a supported OpenRouter model — Z.ai's flash tier, and the cheapest vision model this library carries pricing for at **$0.15 / $0.50 per MTok**, undercutting `qwen/qwen3.6-flash` on both sides. Takes text, image, and video input, with a 1,310,720-token context (OpenRouter caps its own routing at 1,048,576) and a 131,072-token output ceiling. It supports `response_format` with structured outputs and `reasoning_effort`, so `check()`, `ask()`, `elementsVisible()` and the rest work through the existing OpenRouter driver with no special-casing. Verified live: a `check()` and an `elementsVisible()` call both returned well-formed answers, and the library's estimated cost matched OpenRouter's reported cost to the cent. Note it reasons by default — one to two hundred reasoning tokens per call with no `reasoningEffort` set, billed as output. Cached input is $0.03/MTok, which `calculateCost` does not model (no provider gets a cache discount here). Available as `Model.OpenRouter.GLM_5_3_FLASH`; the vendor prefix routes it, so no configuration is needed beyond `OPENROUTER_API_KEY`.

## [0.22.0] - 2026-09-04

### Added

- **Claude Fable 5.1 (`claude-fable-5-1`)** as a supported Anthropic model — Anthropic's most capable widely released model, succeeding Fable 5 in the same tier at the same **$10 / $50 per MTok**. It is listed alongside Fable 5, Opus 5, Opus 4.8, Opus 4.7 and Sonnet 5 as `xhigh`-capable, so `reasoningEffort: "xhigh"` passes through rather than being remapped to `max`. No driver changes were needed: the Anthropic driver already sends `thinking: {type: "adaptive"}` with `output_config.effort` for every model except Haiku 4.5, which is exactly what Fable 5.1 requires — it rejects `budget_tokens` and sampling parameters outright. Verified live on the visibility bench.
- **GPT-6 Astra (`gpt-6-astra`)** as a supported OpenAI model — OpenAI's most capable tier, aimed at complex reasoning, coding, computer use, research, and document creation; 1.05M-token context (922k max input), 128k max output, image input, knowledge cutoff 2026-04-30 ([model page](https://developers.openai.com/api/docs/models/gpt-6-astra)). Pricing: **$10 / $50 per MTok** input/output. Cached input is $1/MTok and cache writes $12.50/MTok; neither is modelled, since `calculateCost` applies no cache discount on any provider.
- **`timeout` config option** — a per-request timeout in milliseconds, forwarded to the underlying provider SDK (`timeout` for OpenAI, OpenRouter and Anthropic; `httpOptions.timeout` for Google). Unset by default, so **existing behaviour is unchanged** and each SDK keeps its own default: 10 minutes for OpenAI and OpenRouter, 1 minute for Google. Worth setting for heavy reasoning models — `gpt-6-astra` calls were observed hanging for 905s (15 minutes) before the SDK gave up, and one succeeded only after 307s. Note that provider SDKs retry timed-out requests (OpenAI defaults to 2 retries), so total wall time can exceed the configured value by a multiple.
- **Element visibility benchmark** (`pnpm visibility:run` / `pnpm visibility:report`) — a second bench mode that measures how accurately models answer "is this element visible?" rather than how well they find defects. Each image is graded with one call per prompt — elements under `### visible` go through `elementsVisible()` ("X is fully visible"), those under `### absent` through `elementsHidden()` ("X is NOT visible") — and **grading is deterministic**: the returned boolean per element is compared with the ground truth, so there is no judge to run, cache, or calibrate. Ground truth lives in a per-dataset `visibility_per_file.md` (`## <filename>`, then `### visible` and `### absent` bullet lists); both lists are merged and sorted before being sent, so their order never hints at the expected answer. The section picks **which prompt asks**; a bullet's optional trailing `| TRUE` / `| FALSE` flag (default `TRUE`) picks **the expected answer**, independently. `| FALSE` is the way to write a **near-miss statement** such as `- The "Orbit" chewing gum logo in the header | FALSE` under `### visible`, testing whether a model reads the description or pattern matches on a word it recognises; it also keeps a call's expected answers from being uniform, which the report warns about. Answers are normalised to a common "is it on screen?" before grading, so every metric means the same thing under both prompts, and the leaderboard additionally splits accuracy by prompt so phrasing sensitivity is visible. The flag is never sent to a model, so toggling one regrades existing runs without re-running them. The leaderboard ranks by element accuracy and separates the two failure modes — missing an element that is there, and **hallucinating one that is not** (the headline `Halluc.` column). Records store the elements sent plus a prompt and image hash, so moving an element between `visible` and `absent` regrades existing runs for free while rewording one marks them stale. `pnpm visibility:report` also writes a self-contained `report.html` carrying the leaderboard, the image-by-model matrix and a **consistency grid**: one row per (image, element), one column per model, each cell counting the reps that answered correctly. A cell between zero and the rep count is the model disagreeing with itself on identical input, which no average shows; those are shaded and filterable, and any cell opens every rep's answer and reasoning beside the screenshot. Both reports also carry a **per-statement pivot** — one row per bullet wording, one column per model, each cell the number of files in which that wording drew a wrong answer, worst first — which is the view for auditing ground truth: a bullet failing across many files is the wording, one failing on a single file is the model or that file's label. `pnpm visibility:run --correct-rendering` turns `requireCorrectRendering` on as a run axis alongside effort and fidelity: those records keep their own `@correct-rendering` directory and grade as a separate `(correct-rendering)` series, so the option's effect is measured side by side in one report rather than across two sweeps. Lives in `bench/visibility/` alongside the video harness; the screenshot bench is unchanged. You supply the dataset — none is committed. See [`bench/visibility/README.md`](./bench/visibility/README.md).

### Changed

- **The benchmark datasets and their results are tracked now, and `new_golden_dataset` is simply `golden`.** The seeded-defect ground truth (`golden`, 18 screenshots with one deliberate defect each plus a clean control) and its element-level counterpart (`visibility-golden`) are hand-built and not reproducible from anything in the repo, so they lived exactly one laptop away from being lost; the graded runs beside them are the record of every sweep so far. Both, and `bench/results/` for them, are now under version control. `primary` stays gitignored — its screenshots are private product UI, and its run records quote model output about them verbatim — as do the presence-only visibility records archived under `_archive-presence-only/`, which the rendering-quality default made incomparable. `benchConfig.dataset` therefore defaults to `golden` rather than a dataset a fresh clone would not have. Renaming `new_golden_dataset` moved its results directory with it and the reports were regenerated, since the page links screenshots by a path relative to itself.
- **`elementsVisible()` no longer fails an element merely because it is cut off at an edge.** The old rule ("partially visible means not fully visible, fail the check") treated two opposite situations as one. A card peeking past the end of a horizontal carousel, a filter chip in a row continuing past the screen edge, or a list item partly below the fold is _correct_ design — the peek is how the interface advertises that the surface scrolls — yet the old rule reported it as a failure, so any test asserting on a scrollable row failed with no bug behind it. The prompt now asks the question a human tester asks: **would ordinary scrolling bring this fully into view?** If yes the check passes; if the element is sliced by the screen edge or by fixed chrome such as the status bar, a notch, a home indicator, a sticky header or a fixed bottom navigation bar, that is a layout fault and the check fails. An element not visible anywhere in the screenshot still fails, since only what the screenshot shows is judged. `elementsHidden()` gains the matching clarification: anything rendered at all, including a peeking item, is not hidden, while an element absent from the screenshot counts as hidden. The generated statement wording changes from `"X" is fully visible on the page` to `"X" is visible on the page`, since "fully" contradicted the new rule. **`elementsVisible()` also judges an element's finished state.** Something drawn over an element used to have no rule at all, and coverage is the wrong test: on a typical card a price pill and a favourite icon obscure more of the cover image than a loading spinner does, yet only the spinner means the content is not ready. The prompt now separates the two — decorative chrome that coexists with finished content leaves an element visible, while a spinner, skeleton, shimmer, progress bar or error overlay makes it fail even when you can still see what sits underneath — and adds the blocking case, where a modal, dialog, cookie banner or toast covers an element a user could not then read or use. `elementsHidden()` gains the matching rule: an element under a state overlay is still rendered, so it is not hidden either, leaving it failing both directions exactly as an element clipped by fixed chrome already does. A new **`finalState` option** on `elementsVisible()` and `elementsHidden()` controls this: it defaults to `true`, matching a test that asserts on a settled screen, and `finalState: false` leaves the finished-state rules out of the prompt for screenshots deliberately captured mid-load. Presence, clipping and blocking overlays are still judged either way, since none of those depend on the interface having settled. Note the option omits the guidance rather than inverting it — to have a model actively disregard loading indicators, say so in `instructions`. **`elementsVisible()` can judge presentation as well as presence, on request.** With the new **`requireCorrectRendering`** option, an element that is present but clearly badly rendered fails — text at contrast too low to read, elements overlapping, an element out of alignment with its siblings, or text cut off mid-word — with the model told to say the element is present before naming the defect. The option defaults to `false`, so the default check is unchanged: presence only, where anything rendered counts however it looks. It was briefly default-on during development; measured on the visibility bench with the rule on and off at five reps, it caught exactly the one bullet naming a present-but-overlapping element (5/5 on both models, against 3/5 and 0/5 without it) and nothing else, while tripling Gemini's flakiness on unrelated presence questions, so it ships opt-in. Because open-ended defect hunting makes models over-report, the rule counts only unambiguous defects and explicitly refuses to fail an element for tight spacing or stylistic choices. `elementsHidden()` ignores the option, since a rendering defect cannot change an answer about absence.

### Removed

- **The synthetic `example` and `visibility-example` datasets, and `pnpm video:example`.** Both datasets existed so a fresh clone could run `pnpm bench:run` / `pnpm visibility:run` against something; in practice every real sweep uses a private dataset, and the committed ones only invited runs whose numbers meant nothing. [`bench/datasets/README.md`](./bench/datasets/README.md) documents the two ground-truth formats (`issues_per_file.md` and `visibility_per_file.md`) a dataset has to follow, and both harnesses take `--dataset <id-or-path>` so one can live anywhere on disk. `pnpm video:example` went with them: it built its synthetic clip by cutting between the example screenshots, and had no other input. Nothing under `src/` is affected — this is bench tooling only.

### Fixed

- **Stray control characters no longer reach callers, or fail a good response.** Two OpenRouter routes were observed emitting them: Kimi writes raw control characters inside JSON string literals, which strict `JSON.parse` rejects outright, and Muse Spark mangles non-ASCII characters into escaped ones — `"−"` arrives as `\u0002` plus the digits, `"é"` as `\u0000` plus `"e9"` — which parse cleanly and then surface as garbage in `statements[].statement`, where Zod cannot catch them because any string validates. The response parser now retries a failed parse with raw control characters replaced by spaces, and strips stray control characters (everything below U+0020 except tab, newline and carriage return, plus DEL) from every string in the parsed result. The original character cannot be recovered, so `"−20%"` becomes `"20%"`: wrong, but printable, searchable and safe to log. Exposed as `stripControlCharacters()` for callers post-processing their own JSON.
- **`gpt-6-astra` now gets a 32768-token output budget by default, at every reasoning effort.** The existing auto-increase fired only for OpenAI/OpenRouter at `high`/`xhigh` effort; everything else got `DEFAULT_MAX_TOKENS` (4096), and Astra routinely spent that entire budget on reasoning before emitting an answer — plain `check()` and `ask()` calls failed with `VisualAITruncationError` (`status "incomplete" (max_output_tokens)`) at the library's own defaults. A new `MODELS_REQUIRING_LARGE_OUTPUT_BUDGET` set drives the increase from the model rather than the effort level, using a new `OPENAI_HEAVY_REASONING_MAX_TOKENS` (32768) rather than the effort-based 16384 — OpenAI's reasoning guide recommends reserving "at least 25,000 tokens for reasoning and outputs", which 16384 sits below. An explicit `maxTokens` still wins, and no other model's behaviour changes. **This is an improvement, not a guarantee** — see the Astra reliability note below.

### Notes for upgraders

- **`requireCorrectRendering` is opt-in; the default `elementsVisible()` check is unchanged.** Turn it on only for assertions where a rendering defect is the thing under test. Expect more false failures than a presence check produces when it is on, since models over-report on open-ended defect questions; the `accessibility()` and `layout()` templates remain the narrower tools when you want one defect class rather than all of them.
- **The `elementsVisible()` change above alters existing results.** A test that asserted an element was _not_ visible purely because it was clipped at the trailing edge of a scrollable row will now see it pass. This is the intended correction, but review any suite that relied on the old behaviour to catch carousel clipping — express that as a layout or content check instead, since `elementsVisible()` now deliberately treats scroll-reachable clipping as normal. Verified against two models on a matched pair of screenshots: a carousel peek and a bottom navigation bar clipped below the safe area, with both models answering both cases correctly under both prompts.
- **Astra is gated behind OpenAI's Trusted Access Program.** Until the account is enabled, calls fail with `VisualAIProviderError` carrying HTTP 404 (`The model 'gpt-6-astra' does not exist or you do not have access to it`), and the model is absent from `GET /v1/models`.
- **Astra's output length is erratic; the budget raises the ceiling rather than removing the failure mode.** Measured live: identical `check()` calls have returned anywhere between 0 and 16384+ reasoning tokens. Runs that reasoned little finished in 6-8s using 60-190 output tokens; runs that reasoned heavily consumed the entire budget and raised `VisualAITruncationError` — first at 4096, then again at 16384, which is what prompted the 32768 floor. Two calls also failed with `Request timed out` from the OpenAI SDK. Note the cost exposure: a call that burns a full budget and _then_ fails still bills for it — roughly $1.64 at 32768 and Astra's $50/MTok output rate. `max_output_tokens` is optional in the Responses API and could be omitted entirely to make truncation impossible, but that removes the cost ceiling (Astra's 128k max output is ~$6.40 per call), so this library keeps an explicit cap. Astra does not support `reasoningEffort: "none"` (HTTP 400), and reasoning tokens cannot be capped separately from visible output.
- **Astra accepts a fifth reasoning level, `max`, above `xhigh` — this library does not expose it.** `reasoningEffort` remains `low | medium | high | xhigh`, passed through to `reasoning.effort` unchanged. Adding `max` would require a mapping decision for every other provider (none of Anthropic, Google, or OpenRouter has an equivalent), so it was deliberately left out of this change.
- Astra is deliberately **absent from the `bench/` roster**: an unavailable model would fail every cell of a sweep for anyone without Trusted Access, and at $10 / $50 per MTok it is ~8x the cost per run of the priciest model currently on the board.
- The OpenAI default model is unchanged (`gpt-5.6-luna`); pass `model: "gpt-6-astra"` (or `Model.OpenAI.GPT_6_ASTRA`) to opt in.

## [0.21.0] - 2026-09-03

### Changed

- **The OpenAI default model is now `gpt-5.6-luna`, replacing `gpt-5.4-mini`.** Luna is both cheaper ($0.20 / $1.20 per MTok vs. $0.75 / $4.50) and newer. This affects any caller who does not pass `model` explicitly and relies on `OPENAI_API_KEY` alone for provider detection — `visualAI()` with no config, or `visualAI({ apiKey: "..." })`, now sends requests to `gpt-5.6-luna` instead of `gpt-5.4-mini`. Callers who pin a model explicitly (`model: "gpt-5.4-mini"` or `Model.OpenAI.GPT_5_4_MINI`) are unaffected.

### Notes for upgraders

- If you were relying on the implicit OpenAI default, pin `model: "gpt-5.4-mini"` (or `Model.OpenAI.GPT_5_4_MINI`) explicitly to keep the old behavior.

## [0.20.0] - 2026-09-03

### Added

- **Muse Spark 1.3 (`meta/muse-spark-1.3`)** as a supported OpenRouter model — Meta's agentic flagship with native multimodal perception over images, video, documents, and audio; 1M-token context and ~944k max output ([model page](https://developer.meta.com/ai/models/muse-spark/)). Pricing: **$1.25 / $4.25 per MTok** input/output, matching Meta's own listed rates. Added to the `bench/` model roster.
- **Muse Spark 1.3's data-sharing tier (`meta/muse-spark-1.3-contributor`)** is usable and priced correctly, but has **no named constant** — it is not reachable via `Model.OpenRouter.*` autocomplete, is not the default anywhere, and is deliberately **not** in the `bench/` roster. It is the same model at **$0.10 / $0.20 per MTok**, ~12x cheaper, because Meta uses everything submitted through it for product improvement — using it must always be a conscious choice, never a default. Pass the slug directly (`model: "meta/muse-spark-1.3-contributor"`) to opt in; cost tracking works correctly once you do. OpenRouter itself refuses it with HTTP 404 (`paid-model-training-violation-by-account`) until the account allows training endpoints at [openrouter.ai/settings/privacy](https://openrouter.ai/settings/privacy).
- **Video bug-hunting harness (`bench/video/`).** A separate harness that sends a screen recording to a model and asks it to list every software bug it can see, with timestamps. Two delivery modes: `native` hands the video bytes to Gemini, which samples and tokenises them server-side (`videoMetadata.fps`, `mediaResolution`) and also hears the audio track; `frames` runs the library's own ffmpeg sampler through `ask()`, so the capability under test can be measured against what library users get today. Clips over 19 MB upload through the Gemini Files API automatically. Output is a Zod-validated bug report (severity, category, start/end timestamp, screen, observed, expected, evidence, confidence) plus a Markdown report and one JSON record per call. `pnpm video:example` builds a synthetic clip with four known defects from the committed screenshot dataset so the pipeline runs on a fresh clone. See [`bench/video/README.md`](./bench/video/README.md). Nothing under `src/` changed: this is tooling, not library surface.
- Meta's cached-input rate for this model is $0.15 per MTok. As with every other provider, `calculateCost` applies no cache discount — `cachedInputTokens` stays informational.

### Notes for upgraders

- **Muse Spark 1.3 is age-gated by OpenRouter.** Until the account completes the 18+ confirmation at [openrouter.ai/settings/preferences](https://openrouter.ai/settings/preferences), every call returns HTTP 403 and the library surfaces a `VisualAIAuthError` reading `This model requires you to complete the following before use: 18+ age confirmation`. It is deliberately absent from the smoke suite for that reason: an unconfirmed account would fail the run for everyone else.
- **It reasons by default.** With no `reasoningEffort` set, the driver sends no reasoning field, but the model still spent 370–814 reasoning tokens per call — roughly half to four-fifths of its output budget. Explicit efforts scale as expected (~205 / ~501 / ~710 reasoning tokens at low / medium / high). Budget `maxTokens` accordingly; the 4096 default is ample for single checks.
- **Meta's data-sharing tier has no named constant, by design.** `meta/muse-spark-1.3-contributor` costs $0.10 / $0.20 per MTok — 12x cheaper — because Meta uses the submitted data for product improvement. It is deliberately absent from `Model.OpenRouter` and every default, so it can never be reached by accident; the pricing table still recognizes the literal slug, so `calculateCost` and usage tracking work correctly once you pass it yourself. Use it only if sending your screenshots to Meta for training is a trade you've deliberately made.
- The OpenRouter default model is unchanged (`qwen/qwen3.6-flash`); pass `model: "meta/muse-spark-1.3"` (or `Model.OpenRouter.MUSE_SPARK_1_3`) to opt in.

### Fixed

- **`atomicWriteJson` (`bench/`) raced with itself and could abort a whole scoring pass.** It wrote to a fixed `<dest>.tmp` before renaming, so two concurrent writers targeting the same destination collided: the first rename succeeded and the second failed with `ENOENT`. This is reachable in normal use because judge verdicts are cached by content hash — two in-flight runs producing an identical (expected, reported) pair hash to one cache path. Observed killing a 2430-run scoring pass after 3 collisions. The temp name now carries a random suffix, and a failed write cleans up after itself.

### Changed

- **`bench:run --models` and `bench:score --models` now select models outright instead of filtering the configured roster.** Previously both intersected the flag with `benchConfig.models`, so naming a model absent from the roster produced "Filters matched no models" on the runner and a silent "Skipping records" on the scorer. The roster is the default set, not an allowlist. This makes it possible to sweep and score a one-off model without editing `bench.config.ts` — which matters when a model should _not_ be in every future sweep, such as a vendor's data-sharing endpoint. Unknown bare names still fail fast in `inferProvider()`.

### Removed

- **The `excluded-golden` prompt variant (`bench/`).** Superseded by `excluded-golden-v2` and dropped along with its on-disk runs, scores, and results markdown. Its wording named four exclusion categories and cut mean extras/run 1.89 -> 0.28, but also dropped mean recall 66.8% -> 58.1%: naming categories made models globally more conservative rather than merely quieter, and its narrow "cut off mid-word inside its own container" guard became a loophole models used to keep reporting the carousel clip anyway. That reasoning is preserved in the `bench.config.ts` header comment so the lesson outlives the variant.

### Verified

- Exercised live against OpenRouter on 2026-09-03 with the smoke fixture screenshot: `check()` (positive and negative assertions), `ask()`, and `compare()` all returned schema-valid structured output, so the model satisfies the library's JSON contract. Image input, `reasoningEffort`, and usage tracking all work. **Our estimated cost matched OpenRouter's own `usage.cost` to the last digit on all six calls** ($0.004498, $0.005858, $0.006742, $0.005448, $0.006984, $0.007159), confirming the $1.25 / $4.25 table entry is exact and that OpenRouter applies no token markup. Latency ran 4.3–9.1 s per call.

## [0.19.0] - 2026-08-14

### Added

- **Gemini 3.8 Flash (`gemini-3.8-flash`)** as a supported Google model — GA flash tier aimed at long-horizon software engineering, agentic tasks, and multi-step reasoning in specialized domains; 1M-token context, 64k max output, tunable thinking levels ([announcement](https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/)). Built-in pricing uses the introductory rate of **$0.75 / $3.75 per MTok** input/output, the same as 3.7 Flash and on the same schedule: in effect through 2026-12-31, reverting to $1.50 / $7.50 on 2027-01-01, after which `calculateCost` (and the `bench/` cost columns) will undercount until the pricing table is updated.
- `gemini-3.8-flash` added to the annotated-diff allowlist (`DIFF_ALLOWED_MODELS`) and to the `bench/` model roster.
- **Gemini 3.7 Flash (`gemini-3.7-flash`)** as a supported Google model — newest GA flash tier with gains over 3.6 Flash on coding, debugging, issue resolution, and document/business-workflow tasks ([announcement](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-3-7-flash/)). Built-in pricing uses the introductory rate of **$0.75 / $3.75 per MTok** input/output, in effect through 2026-12-31; it reverts to $1.50 / $7.50 on 2027-01-01, so `calculateCost` (and the `bench/` cost columns) will undercount past that date until the pricing table is updated.
- `gemini-3.7-flash` added to the annotated-diff allowlist (`DIFF_ALLOWED_MODELS`), alongside `gemini-3-flash-preview`, `gemini-3.5-flash`, and `gemini-3.6-flash`. Lite models remain excluded.
- **Cached prompt tokens.** `UsageInfo` gains `cachedInputTokens` — prompt tokens a provider served from its cache, when it reports them (Anthropic, OpenAI, Google, OpenRouter). Informational only: `estimatedCost` applies no cache discount, because providers disagree on whether cached tokens are counted inside `inputTokens` (OpenAI, OpenRouter, Google) or billed as a separate bucket alongside it (Anthropic). Debug usage logs and the `bench/` leaderboard (new "Cache hit" column) surface it.
- **Qwen3.8 Max (`qwen/qwen3.8-max`)** as a supported OpenRouter model — first Max tier to accept image input. Pricing: $2 / $6 per MTok input/output.
- **Grok 4.6 (`x-ai/grok-4.6`)** as a supported OpenRouter model — newest xAI flagship with 500K context and image input ([announcement](https://x.ai/news/grok-4-6)). Pricing: $2 / $6 per MTok input/output, matching Grok 4.5 (verified 2026-08-14 against `openrouter.ai/api/v1/models`, `input_modalities` includes `image`).

### Notes for upgraders

- The Google default model is unchanged (`gemini-3-flash-preview`); pass `model: "gemini-3.8-flash"` / `"gemini-3.7-flash"` (or `Model.Google.GEMINI_3_8_FLASH` / `Model.Google.GEMINI_3_7_FLASH`) to opt in.

## [0.18.0] - 2026-07-31

### Added

- **Provider-reported actual cost.** `UsageInfo` gains `reportedCost` — the real USD cost a provider returns for a call, distinct from the local-pricing `estimatedCost`. The OpenRouter driver now surfaces the `usage.cost` it already requests (`usage: { include: true }`); other providers don't return a cost, so it's absent there. The `bench/` cost columns prefer `reportedCost` when present, falling back to `estimatedCost`. (Verified OpenRouter's `cost` equals our token×price estimate exactly for `google/gemini-3.5-flash`, i.e. no markup on tokens.)
- **Configurable image fidelity.** Two new `visualAI()` options let callers trade image resolution/detail against cost and latency: `maxImageDimension` (longest-edge pixel cap applied during normalization, default 1568) and `imageDetail` (`"auto"` | `"low"` | `"high"`, default `"auto"`). `imageDetail` maps per provider — OpenAI/OpenRouter `detail`, Google `mediaResolution` (LOW/HIGH); it is a **no-op on Anthropic**, which auto-downscales images to ~1568px/1.15MP regardless. `"auto"` sends no detail field, so default behavior is unchanged. `ImageDetail` / `ImageDetailLevel` are exported from the package root.

### Changed

- **The benchmark harness is now dataset-agnostic, and datasets stay out of the repository.** `bench/` used to read a single hardcoded `golden_data_set/` directory and write every artifact into one shared `bench/results/`. A dataset is now any directory containing `issues_per_file.md` plus its images, selected per run with `--dataset <id-or-path>` on `bench:run` / `bench:score` / `bench:report` / `bench:calibrate-embed`, or by `BENCH_DATASET` in `.env`, falling back to `dataset` in `bench.config.ts`. A value without a path separator names a directory under `bench/datasets/`; a value with one is a path, so a dataset can live entirely outside the repo. Results are namespaced per dataset (`bench/results/<dataset-id>/…` — manifest, runs, judge cache, scores, reports), so several datasets coexist without their image ids or run records ever mixing. The HTML report links screenshots through a computed relative path instead of a hardcoded `../../golden_data_set/`, so reports work for any dataset location. See [`bench/README.md`](./bench/README.md) and [`bench/datasets/README.md`](./bench/datasets/README.md).
- **`bench/datasets/` and `bench/results/` are gitignored.** Screenshots under test are usually private product UI, and run records quote model output about them verbatim; neither belongs in a shared repository. A synthetic `example` dataset (five generated 480×800 screenshots, four with a deliberate defect and one clean control) is committed so the pipeline runs on a fresh clone, and is the default in `bench.config.ts`.
- **Reasoning effort and image fidelity are first-class axes in the benchmark harness (`bench/`).** A model can be swept at several efforts/fidelities and each appears as its own row/column: the `(model, reasoning-effort, image-fidelity)` tuple is a "series" (see `seriesId()`), and scoring, the leaderboard, the matrix, `scores.cells`, judge comparison, and the overrides key are all keyed by series instead of the bare model. `pnpm bench:run` takes `--effort <low|medium|high|xhigh>` and `--fidelity <auto|low|high>`; non-default values are stored under `runs/<variant>/<model>@<effort>[@fid-<fidelity>]/…` so existing sweeps need no migration. The HTML report gains a **reasoning-effort filter** and shows the full series id (model + non-default tags) in the leaderboard and matrix. Added `gpt-5.6-luna` at `xhigh` to the sweep alongside its `medium` baseline.
- **Updated OpenAI GPT-5.6 Terra and Luna pricing** to match OpenAI's 2026-07-30 price cut ([announcement](https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/)). Terra drops from $2.50/$15 to $2/$12 per MTok (−20%); Luna drops from $1/$6 to $0.20/$1.20 per MTok (−80%). Affects the estimated cost reported by `calculateCost` and the `bench/` cost columns.

### Fixed

- **Gemini cost was undercounted — thinking tokens are now billed.** The Google driver reported only the visible answer (`candidatesTokenCount`) in `outputTokens` and split the thinking trace (`thoughtsTokenCount`) into a separate `reasoningTokens` field that `calculateCost` ignored — even though Google bills thinking at the output-token rate. `outputTokens` now includes thinking (matching OpenAI/OpenRouter, whose output counts already subsume reasoning), with `reasoningTokens` kept as the breakdown. Estimated Gemini cost rises accordingly (e.g. `gemini-3.5-flash` at medium effort ≈ $0.0035 → $0.0129 per run in the `bench/` set — the visible answer is tiny, so thinking dominates). OpenAI, Anthropic, and OpenRouter were already correct. Verified against OpenRouter's own `usage.cost` field for the same model (`google/gemini-3.5-flash`), which matched our recomputed cost to the last digit.

### Notes for upgraders

- `imageDetail` and `maxImageDimension` only change what a model receives when the source image exceeds the cap. Images already within the cap (typical phone-sized screenshots) are sent at native resolution, and providers already process them at their high-detail default — so `imageDetail: "high"` yields byte-identical input tokens there. To gain resolution you need images larger than the cap plus a higher `maxImageDimension` (OpenAI uses up to a 2048px box at `detail:"high"`; Anthropic re-downscales regardless; Gemini is bounded by its `mediaResolution` token tier).
- **This is the first npm release since 0.16.0.** Versions 0.15.0 and 0.17.0 were tagged in the repository but never published, so upgrading from 0.16.0 picks up their changes too — see those sections below.

## [0.17.0] - 2026-07-27

### Added

- **Anthropic Claude Opus 5** (`claude-opus-5`) — added as a built-in model constant (`Model.Anthropic.OPUS_5`) with pricing ($5/$25 per MTok, matching Opus 4.8) and full `reasoningEffort` support. Like Fable 5, Opus 4.8, Opus 4.7, and Sonnet 5, it accepts the dedicated `"xhigh"` effort tier (mapped 1:1 rather than down to `"max"`). Added to the `bench/` sweep roster as the Anthropic flagship.

### Changed

- **Benchmark harness gained a prompt-variant axis (`bench/`).** The frozen `BENCH_PROMPT` is now one of several named variants in `bench/bench.config.ts` (`baseline` = the original `"What looks visually broken on this page?"`, `excluded` = the same question plus an explicit "out of scope" list for the five noise themes models most often over-report: clipping/overflow, low-contrast legal text, sticky-nav/overlay occlusion, the "SCROLL DOWN" indicator, and cramped spacing). `pnpm bench:run` and `pnpm bench:score` take `--prompt <variant>` (default `baseline`); runs are namespaced under `bench/results/runs/<variant>/…` and scores are written to `scores.<variant>.<judge>.json`. `pnpm bench:report` emits one `report.<judge>.html` per judge that **toggles between prompt variants in-page** (matrix, leaderboard, and prompt hero all swap), plus one `RESULTS.<variant>.<judge>.md` per variant. Existing baseline runs were migrated into `runs/baseline/`; baseline prompt wording is unchanged, so the manifest promptHash guard is unaffected.
- **Google `reasoningEffort` now maps 1:1 to `thinkingLevel`** (`low`→`"low"`, `medium`→`"medium"`, `high`→`"high"`, `xhigh`→`"high"`). Previously the map was shifted one level down (`medium`→`"low"`, `low`→`"minimal"`), leaving Gemini models with far less thinking than other providers at the same configured effort — benchmarking showed this cost Gemini 3.6 Flash ~17 recall points on visual bug detection. `"minimal"` is no longer used, which also avoids models that reject it (Gemini 3.1 Pro).

### Notes for upgraders

- Gemini calls with an explicit `reasoningEffort` will think more (better results, slightly higher output-token cost and latency). Calls without `reasoningEffort` are unchanged.

## [0.16.0] - 2026-07-22

### Added

- **OpenRouter provider** (`openrouter`) — run xAI, Moonshot, and Qwen vision models through a single [OpenRouter](https://openrouter.ai) API key. Any vendor-prefixed model slug (`vendor/model`, e.g. `x-ai/grok-4.5`) is automatically routed to the new provider; `OPENROUTER_API_KEY` is also detected when no model is configured. The driver speaks the OpenAI chat-completions protocol via the already-optional `openai` SDK pointed at the OpenRouter base URL — no new dependency.
- Built-in model constants and pricing for five vision-capable OpenRouter models: Grok 4.5 (`x-ai/grok-4.5`, $2/$6 per MTok), Kimi K3 (`moonshotai/kimi-k3`, $3/$15), Kimi K2.7 Code (`moonshotai/kimi-k2.7-code`, $0.82/$3.75), Qwen3.7 Plus (`qwen/qwen3.7-plus`, $0.32/$1.28), and Qwen3.6 Flash (`qwen/qwen3.6-flash`, $0.19/$1.13 — the provider default).
- All five models added to the `bench/` sweep roster. They share one "openrouter" concurrency pool since rate limits apply per API key.
- `reasoningEffort` support on OpenRouter via its normalized `reasoning.effort` field; `"xhigh"` clamps to `"high"` (OpenRouter's maximum). The high/xhigh automatic `maxTokens` increase (16384) now also applies to the OpenRouter provider, since reasoning tokens share the output budget there too.

### Changed

- Bench run records for models with `/` in the slug are stored under a sanitized directory name (`x-ai__grok-4.5`); records still carry the true model name and scoring is unaffected.

### Fixed

- Smoke tests asserted `issues`/`statements` on `compare()` results, but `CompareResult` carries `changes` instead — every provider's compare smoke test would have failed on its next run. All four smoke suites (including the new OpenRouter one) now assert the correct shape.

### Notes for upgraders

- Fully backward compatible. `ProviderName` gains the `"openrouter"` member; exhaustive switches over it in consumer code need a new arm.
- `qwen/qwen3.7-max` was deliberately excluded: it accepts no image input on OpenRouter. There is no Qwen 3.7 Omni-Flash; `qwen/qwen3.6-flash` is the flash-tier vision substitute.

## [0.15.0] - 2026-07-22

### Added

- **Gemini 3.6 Flash (`gemini-3.6-flash`)** as a supported Google model — newest GA flash tier with improved coding/knowledge-work performance and ~17% fewer output tokens than 3.5 Flash. Pricing: $1.50 / $7.50 per MTok input/output.
- **Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`)** as a supported Google model — GA budget/agentic tier. Pricing: $0.30 / $2.50 per MTok input/output.
- `gemini-3.6-flash` added to the annotated-diff allowlist (`DIFF_ALLOWED_MODELS`), alongside `gemini-3-flash-preview` and `gemini-3.5-flash`. Lite models remain excluded.
- Both new models added to the `bench/` sweep roster.

### Fixed

- README's default-models table still listed `gpt-5-mini` as the OpenAI default; corrected to `gpt-5.4-mini` (the supported-models table was already fixed in 0.13.0).

### Notes for upgraders

- Fully backward compatible. Defaults are unchanged — `gemini-3-flash-preview` remains the Google default; the new models are opt-in via `config.model`.

## [0.14.0] - 2026-07-21

### Added

- **Pre-sampled frames input for `check()` and `ask()`.** Both methods now accept a `FramesInput` (`{ frames, fps? }`) in place of a `MediaInput`, where each frame is an `ImageInput` or a `{ image, timestampSeconds }` pair. Use it when you already have an array of screenshots or otherwise can't pass a video file. Frames are handled identically to a sampled video — the same chronological-timeline prompt, `frames` metadata, per-statement `timestampSeconds`, and `frameReferences` all work unchanged — but **no ffmpeg is loaded on this path**. Timestamps for bare frames are derived as `index / fps` (default `fps` is `1`); a per-frame `timestampSeconds` overrides that. The frame count is subject to the same 60-frame hard cap as video sampling.
- New exported types `FramesInput` and `TimestampedFrameInput`.

### Notes for upgraders

- Fully backward compatible. Existing image and video calls are unchanged; the new `FramesInput` shape is purely additive. Consumers that already have their own frames can now pass `{ frames }` directly and drop `@ffmpeg-installer/ffmpeg` if they never send video files.

## [0.13.1] - 2026-07-20

### Fixed

- `ask()` requests against the OpenAI provider failed for image (non-video) inputs with a schema validation error. OpenAI's strict structured-output mode requires every response field to be present, so it returned `frameReferences: null` for image inputs instead of omitting the key — but the Zod schema only accepted `undefined`. `frameReferences` is now nullable at the parsing boundary and normalized back to `undefined` on the returned `AskResult`, so the public shape (`number[] | undefined`, present only for video) is unchanged.

## [0.13.0] - 2026-07-17

### Added

- **Claude Opus 4.8 (`claude-opus-4-8`)** and **Claude Sonnet 5 (`claude-sonnet-5`)** as supported Anthropic models. Opt-in only — `claude-sonnet-4-6` remains the Anthropic default.
- **Claude Fable 5 (`claude-fable-5`)** as a supported Anthropic model — Anthropic's most capable widely released model, for the most demanding reasoning and long-horizon agentic work. Pricing: $10 / $50 per MTok input/output.
- **GPT-5.6 family (`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`)** as supported OpenAI models. Opt-in only — `gpt-5.4-mini` remains the OpenAI default.

### Changed

- `xhigh` reasoning effort now maps to the native `effort: "xhigh"` value on all models that support it (Claude Fable 5, Opus 4.8, Opus 4.7, Sonnet 5), not just Opus 4.7. Older models (Opus 4.6, Sonnet 4.6) continue to map `xhigh` to `effort: "max"`.

### Fixed

- **`gemini-3.1-flash-lite-preview` renamed to `gemini-3.1-flash-lite`.** Google shut down the `-preview` model ID on 2026-05-25; every call using the old ID was failing. The exported constant is renamed from `Model.Google.GEMINI_3_1_FLASH_LITE_PREVIEW` to `Model.Google.GEMINI_3_1_FLASH_LITE`.
- README's OpenAI model table incorrectly marked `gpt-5-mini` as the default model; the actual default (`DEFAULT_MODELS`) has been `gpt-5.4-mini` since it was introduced. Corrected the table.

### Notes for upgraders

- If you referenced `Model.Google.GEMINI_3_1_FLASH_LITE_PREVIEW` or passed the literal string `"gemini-3.1-flash-lite-preview"` as `config.model`, update to `Model.Google.GEMINI_3_1_FLASH_LITE` / `"gemini-3.1-flash-lite"` — the old model ID no longer resolves on Google's side regardless of this library's version.

## [0.12.0] - 2026-05-20

### Added

- **Gemini 3.5 Flash (`gemini-3.5-flash`)** as a supported Google model. Pricing: $1.50 / $9.00 per MTok input/output. Positioned by Google as their strongest agentic and coding model. Opt-in only — `gemini-3-flash-preview` remains the Google default because validation showed `gemini-3.5-flash` interprets the annotated-diff prompt inconsistently (sometimes returns a binary pixel-difference mask instead of the requested overlay).
- `gemini-3.5-flash` added to the annotated-diff allowlist so explicit `compare(..., { diffImage: true })` calls with this model don't throw. The compare auto-trigger remains restricted to `gemini-3-flash-preview` for predictable annotation quality.

### Changed

- `generateAiDiff()` allowlist error message now lists both supported diff models instead of naming only `gemini-3-flash-preview`.

## [0.11.0] - 2026-05-11

### Added

- **`Accessibility.COLOR_BLINDNESS`** check: flags color choices likely to be indistinguishable to viewers with common color vision deficiencies (e.g., red/green deuteranopia/protanopia, blue/purple confusion). Use it to catch charts, status indicators, and other meaningful color pairings that rely on commonly confused hues.
- **`Accessibility.COLOR_ALONE`** check: flags information conveyed by color alone, without a non-color cue. Use it to catch required fields, error states, chart legends, link styling, and other meaning that's encoded only through hue (no icon, text, pattern, or position).
- Two new default edge rules for the accessibility template: purely decorative color (branding, backgrounds, gradients) is exempt, and hover/focus state colors are not assumed if not visible in the screenshot.

### Notes for upgraders

- `ai.accessibility(screenshot)` (no options) now also evaluates the two new checks, so the default check set goes from 3 statements to 5. Passing screenshots that have meaningful color-only cues may start failing where they previously passed.
- To preserve prior behavior, pass an explicit `checks` array: `{ checks: [Accessibility.CONTRAST, Accessibility.READABILITY, Accessibility.INTERACTIVE_VISIBILITY] }`.

## [0.10.0] - 2026-05-06

### Added

- **`VISUAL_AI_DEBUG_FRAMES` env flag** persists sampled video frames to disk for offline debugging. Set to `"true"` or `"1"` and the library writes each sampled JPEG (filename includes index and timestamp) to `./visual-ai-debug-frames/<timestamp>-<id>/`. Override the base directory with `VISUAL_AI_DEBUG_FRAMES_DIR=/some/path`. Best-effort: disk failures are warned to stderr and never break the actual provider call. No effect on image-only inputs.

### Changed

- **Video support installs out of the box.** `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, and `@ffprobe-installer/ffprobe` moved from optional peer dependencies to regular `dependencies`. No more separate `npm install --save-dev fluent-ffmpeg @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe` step — `npm install visual-ai-assertions` is enough to use video input.

### Notes for upgraders

- **Install footprint grows by ~40–50 MB** because `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe` bundle platform-specific ffmpeg/ffprobe binaries. Image-only consumers who care about install size can prune them with `npm prune` or your package manager's equivalent; runtime image flows do not import ffmpeg.
- If you previously installed the three packages manually as devDependencies, you can remove them — they now come transitively from `visual-ai-assertions`.
- `VisualAIVideoError` is still thrown when video input is passed but ffmpeg can't be loaded (e.g., unsupported platform binary, pruned install). The error path is unchanged.

## [0.9.0] - 2026-05-06

### Added

- **Video input support** in `ai.check()` and `ai.ask()`. Pass an `.mp4`/`.webm`/`.mov`/`.mkv` file path, base64 string, data URL, `Buffer`, or `Uint8Array`; the library samples frames with ffmpeg and feeds them to the provider as a chronological timeline. Defaults: 1 fps, max 10 frames, max 10 s of source video. Override via `options.video: { fps, maxFrames, maxDurationSeconds }`.
- **Per-statement timestamps** for video checks: `StatementResult.timestampSeconds` reports approximately when each statement became true, or `null` if it failed or applies across the whole clip.
- **Frame metadata on results**: `CheckResult.frames` and `AskResult.frames` (`{ count, timestampsSeconds, durationSeconds }`) describe the sampled timeline the model saw.
- **`AskResult.frameReferences`** — for video asks, the model returns the indices of frames it relied on for the answer.
- **`VisualAIVideoError`** error class with code `VIDEO_INVALID`. Surfaces missing ffmpeg deps, oversized videos, decode failures, and timeouts.
- New exported types: `MediaInput`, `Frame`, `VideoSamplingOptions`, `VideoFramesMetadata`, `SupportedVideoMimeType`.
- Three new optional peer dependencies: `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`. Install only if you need video support; image-only flows continue to work without them.
- Hard wall-clock timeouts on the ffmpeg pipeline (15 s for `ffprobe`, 60 s for frame extraction) and a hard cap of 60 on `maxFrames` to keep memory bounded.

### Changed

- The first parameter of `check()` and `ask()` is now typed `MediaInput` (alias of `ImageInput`) and documented as accepting both images and short videos. No call-site change required for image consumers.

### Notes for upgraders

- **`VisualAIErrorCode` union widened** with `"VIDEO_INVALID"`. Downstream code with exhaustive `switch (error.code)` will get a TypeScript error until the new case is handled — see the README's Error Handling section for the recommended switch shape.
- **Template helpers (`accessibility`, `layout`, `pageLoad`, `content`, `elementsVisible`, `elementsHidden`) remain image-only.** Pass video to `check()` or `ask()` instead.
- **HTTP/HTTPS URLs are not accepted as video input.** Fetch the bytes yourself first and pass them as a `Buffer` or `data:` URL. Image URL fetch is unchanged.
- ffmpeg peer deps are declared with `peerDependenciesMeta.optional: true`. Modern npm/pnpm/yarn skip them by default; npm < 7 emits unmet-peer warnings that are harmless.

## [0.8.0]

- Claude Opus 4.7 model support.
- GPT-5.5 model support.
- Model-aware `xhigh` reasoning-effort mapping for Anthropic models.

## [0.7.2]

- Fix OpenAI Responses API `text.format` shape.

## [0.7.1]

- Fix OpenAI `json_object` format for newer models.

## [0.7.0]

- Truncation detection via `VisualAITruncationError`.
- Gemini 3.1 Flash Lite support.
- Reasoning-token usage exposed in `UsageInfo`.

## [0.6.0]

- Granular debug env vars (`VISUAL_AI_DEBUG_PROMPT`, `VISUAL_AI_DEBUG_RESPONSE`).
- `VISUAL_AI_REASONING_EFFORT` env var.

## [0.5.0]

- GPT-5.4 mini and nano model support.

## [0.4.0]

- Bundle all provider SDKs by default.

## [0.3.0]

- Bundle OpenAI SDK by default; update repo URLs.

## [0.2.0] - 2026-03-16

### Breaking Changes

- Renamed `query()` to `ask()`, `QueryResult` to `AskResult`, and `QueryResultSchema` to `AskResultSchema`.
- Renamed the `edgeCaseRules` option to `rules` across the public API.
- Narrowed `NormalizedImage.mimeType` from `string` to the `SupportedMimeType` literal union.

### Added

- Optional `AskOptions` with `rules` support for `ask()`.
- Stable `error.code` values on all public error classes for programmatic handling.
- `VisualAIErrorCode`, `VisualAIKnownError`, `SupportedMimeType`, and `isVisualAIKnownError` exports.
- JSDoc coverage across the public API surface.
- `sideEffects: false` package metadata for tree-shaking.

### Changed

- Provider drivers now accept config objects instead of positional constructor arguments.
- Config resolution moved into a dedicated core module.
- Debug logging, usage accounting, and duration tracking moved into a dedicated core module.
- Provider creation now uses a typed registry for exhaustive provider handling.
- README examples and API docs now reflect the flat constant exports and current method signatures.

### Fixed

- README template examples now use the correct flat imports (`Accessibility`, `Layout`, `Content`) instead of a nonexistent `Check` namespace.
- README configuration docs now correctly describe `trackUsage` as opt-in by default.
- Public packaging metadata now includes repository, homepage, bugs, and author fields.
