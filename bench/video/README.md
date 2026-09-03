# Video bug-hunting harness

Sends a screen recording to a vision model and asks it to list every software
bug it can see, with timestamps. Built to test how well **Gemini 3.8 Flash**
understands video natively, and to compare that against the frame-sampling path
the `visual-ai-assertions` library uses today.

## Quick start

```bash
# 1. Build a synthetic example clip from the committed screenshot dataset
pnpm video:example

# 2. Ask Gemini 3.8 Flash what is wrong with it
pnpm video:run --video bench/video/videos/example.mp4
```

The run prints the bug list as it arrives and writes a Markdown report plus one
JSON record per call under `bench/video/results/<video-stem>/<timestamp>/`.

To test your own recording, drop it in `bench/video/videos/` (gitignored) and
point `--video` at it. `.mp4`, `.webm`, `.mov`, and `.mkv` are accepted; clips
over 19 MB are uploaded through the Gemini Files API automatically.

`GOOGLE_API_KEY` must be set in `.env`. Frames mode with a non-Google model
needs that provider's key too.

## Modes

| Mode     | What happens                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `native` | The video bytes go straight to Gemini. Gemini samples the clip server-side at `--fps`, tokenises each frame at `--resolution`, and also hears the audio track. **This is the capability under test.** Google models only.             |
| `frames` | The library extracts frames with ffmpeg at `--fps` (capped at `--max-frames`, max 60) and sends them as an ordered image timeline via `ai.ask()`. Works with any supported model. This is the baseline every library user gets today. |
| `both`   | Runs both so the report shows them side by side.                                                                                                                                                                                      |

## Options

```
--video <path>        Recording to analyse. Required.
--models <a,b>        Default: gemini-3.8-flash. e.g. gemini-3.8-flash,gemini-3.7-flash
--mode <m>            native | frames | both (default native)
--fps <n>             Sampling rate (default 2). Transient bugs (toasts, flicker) need higher fps.
--resolution <r>      Native only: default | low | medium | high
--max-frames <n>      Frames only: cap on sampled frames (default 60)
--effort <e>          low | medium | high | xhigh (default medium)
--max-tokens <n>      Output budget incl. thinking (default 16384)
--reps <n>            Repeat each cell to measure consistency
--prompt <variant>    Prompt variant from video.config.ts (default "bugs")
--prompt-file <path>  Use a file's contents as the prompt
--context <text>      Tell the model what the app is and what the flow should do
--expected <path>     Ground-truth notes to embed in the report
--out <dir>           Override the results directory
```

Giving the model `--context` ("This is the checkout flow of a food-delivery
app; the user adds two items and pays") noticeably improves precision, since it
can then judge intent rather than only appearance.

## Ground truth

If a file named `<video-stem>.expected.md` sits next to the video (or is passed
with `--expected`), its contents are embedded in the report under "Expected
(ground truth)" so you can grade the model's list by eye. `pnpm video:example`
writes one for the synthetic clip. There is no automatic judge yet; the JSON
records carry everything needed to add one later (see `bench/src/judge.ts` for
the screenshot harness's approach).

## Output

```
bench/video/results/<video-stem>/<timestamp>/
  REPORT.md                       overview table, ground truth, per-run bug tables and details
  <model>.<mode>.rep<N>.json      one record per call: settings, prompt hash, report, usage, raw text
```

Each record's `usage` includes Gemini's per-modality token breakdown
(`VIDEO` / `AUDIO` / `TEXT`) in native mode, plus thinking tokens and the cost
from the library's pricing table.

## Files

- [`video.config.ts`](video.config.ts) — prompt variants and defaults
- [`src/run.ts`](src/run.ts) — CLI
- [`src/gemini-native.ts`](src/gemini-native.ts) — native video delivery (inline or Files API)
- [`src/frames.ts`](src/frames.ts) — frame-sampled delivery through the library
- [`src/schema.ts`](src/schema.ts) — the structured bug-report schema (Zod + JSON Schema for Gemini)
- [`src/report.ts`](src/report.ts) — Markdown report renderer
- [`src/make-example.ts`](src/make-example.ts) — synthetic example clip generator
