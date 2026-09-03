import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  ReasoningEffort,
  type ReasoningEffortLevel,
  MODEL_TO_PROVIDER,
} from "../../../src/constants.js";
import { calculateCost } from "../../../src/core/pricing.js";
import { getVideoMimeFromExtension, probeDurationSeconds } from "../../../src/core/video.js";
import type { ProviderName } from "../../../src/types.js";
import {
  DEFAULT_VIDEO_PROMPT_VARIANT,
  VIDEO_PROMPT_VARIANTS,
  isVideoPromptVariantId,
  videoBenchConfig,
  type NativeResolution,
  type VideoMode,
} from "../video.config.js";
import { runFramesCall } from "./frames.js";
import { runNativeCall } from "./gemini-native.js";
import { renderReport } from "./report.js";
import { BUG_REPORT_OUTPUT_SECTION, BugReportSchema } from "./schema.js";
import type { VideoRunRecord, VideoUsage } from "./types.js";

const RESULTS_ROOT = resolve("bench/video/results");
const REASONING_EFFORTS = Object.values(ReasoningEffort) as readonly string[];
const RESOLUTIONS: readonly NativeResolution[] = ["default", "low", "medium", "high"];

const USAGE = `Usage: pnpm video:run --video <path> [options]

Sends a screen recording to a model and asks it to list every software bug it can see.

Options:
  --video <path>          Recording to analyse (.mp4, .webm, .mov, .mkv). Required.
  --models <a,b>          Models to run (default: ${videoBenchConfig.model}). Native mode needs Google models.
  --mode <m>              native | frames | both (default: ${videoBenchConfig.mode})
                            native: the video bytes go straight to Gemini (the capability under test)
                            frames: the library samples frames with ffmpeg and sends images (the baseline)
  --fps <n>               Sampling rate in frames/s (default: ${videoBenchConfig.fps}; native range (0, 24])
  --resolution <r>        Native mode: default | low | medium | high (default: ${videoBenchConfig.resolution})
  --max-frames <n>        Frames mode: cap on sampled frames, max 60 (default: ${videoBenchConfig.maxFrames})
  --effort <e>            Reasoning effort: low | medium | high | xhigh (default: ${videoBenchConfig.reasoningEffort})
  --max-tokens <n>        Output token budget incl. thinking (default: ${videoBenchConfig.maxTokens})
  --reps <n>              Repetitions per (model, mode) (default: ${videoBenchConfig.reps})
  --prompt <variant>      Prompt variant from video.config.ts (default: ${DEFAULT_VIDEO_PROMPT_VARIANT})
  --prompt-file <path>    Use the file's contents as the prompt instead of a variant
  --context <text>        Extra context for the model (what the app is, what the flow should do)
  --expected <path>       Ground-truth notes to embed in the report (default: <video>.expected.md if present)
  --out <dir>             Results directory (default: bench/video/results/<video-stem>/<timestamp>)
  --quiet                 Do not print the report to stdout
  -h, --help
`;

interface CliOptions {
  videoPath: string;
  models: string[];
  modes: VideoMode[];
  fps: number;
  resolution: NativeResolution;
  maxFrames: number;
  effort: ReasoningEffortLevel;
  maxTokens: number;
  reps: number;
  promptVariant: string;
  promptText: string;
  context: string | undefined;
  expectedPath: string | undefined;
  outDir: string | undefined;
  quiet: boolean;
}

function fail(message: string): never {
  console.error(`error: ${message}\n`);
  console.error(USAGE);
  process.exit(2);
}

function numberArg(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) fail(`--${name} must be a positive number`);
  return value;
}

async function parseCli(): Promise<CliOptions> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      video: { type: "string" },
      models: { type: "string" },
      mode: { type: "string" },
      fps: { type: "string" },
      resolution: { type: "string" },
      "max-frames": { type: "string" },
      effort: { type: "string" },
      "max-tokens": { type: "string" },
      reps: { type: "string" },
      prompt: { type: "string" },
      "prompt-file": { type: "string" },
      context: { type: "string" },
      expected: { type: "string" },
      out: { type: "string" },
      quiet: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const videoArg = values.video ?? positionals[0];
  if (!videoArg) fail("--video is required");
  const videoPath = resolve(videoArg);

  const modeArg = values.mode ?? videoBenchConfig.mode;
  let modes: VideoMode[];
  if (modeArg === "both") modes = ["native", "frames"];
  else if (modeArg === "native" || modeArg === "frames") modes = [modeArg];
  else fail(`--mode must be native, frames, or both (got "${modeArg}")`);

  const resolution = values.resolution ?? videoBenchConfig.resolution;
  if (!RESOLUTIONS.includes(resolution as NativeResolution)) {
    fail(`--resolution must be one of ${RESOLUTIONS.join(", ")} (got "${resolution}")`);
  }

  const effort = values.effort ?? videoBenchConfig.reasoningEffort;
  if (!REASONING_EFFORTS.includes(effort)) {
    fail(`--effort must be one of ${REASONING_EFFORTS.join(", ")} (got "${effort}")`);
  }

  const fps = numberArg(values.fps, "fps", videoBenchConfig.fps);
  if (fps > 24) fail("--fps must be at most 24");
  const maxFrames = numberArg(values["max-frames"], "max-frames", videoBenchConfig.maxFrames);
  if (maxFrames > 60) fail("--max-frames must be at most 60 (library hard cap)");

  let promptVariant: string;
  let promptText: string;
  if (values["prompt-file"]) {
    promptVariant = `file:${basename(values["prompt-file"])}`;
    promptText = (await readFile(resolve(values["prompt-file"]), "utf8")).trim();
  } else {
    const id = values.prompt ?? DEFAULT_VIDEO_PROMPT_VARIANT;
    if (!isVideoPromptVariantId(id)) {
      fail(
        `unknown prompt variant "${id}"; known: ${Object.keys(VIDEO_PROMPT_VARIANTS).join(", ")}`,
      );
    }
    promptVariant = id;
    promptText = VIDEO_PROMPT_VARIANTS[id];
  }

  return {
    videoPath,
    models: (values.models ?? videoBenchConfig.model)
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    modes,
    fps,
    resolution: resolution as NativeResolution,
    maxFrames,
    effort: effort as ReasoningEffortLevel,
    maxTokens: Math.round(
      numberArg(values["max-tokens"], "max-tokens", videoBenchConfig.maxTokens),
    ),
    reps: Math.round(numberArg(values.reps, "reps", videoBenchConfig.reps)),
    promptVariant,
    promptText,
    context: values.context?.trim() || undefined,
    expectedPath: values.expected,
    outDir: values.out,
    quiet: values.quiet,
  };
}

function inferProvider(model: string): ProviderName {
  if (model.includes("/")) return "openrouter";
  const known = MODEL_TO_PROVIDER.get(model);
  if (known) return known;
  if (model.startsWith("gemini")) return "google";
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt") || model.startsWith("o")) return "openai";
  fail(`cannot infer provider for model "${model}"`);
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function timestampId(date: Date): string {
  return date
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")
    .replace("T", "-");
}

function buildPrompt(
  variantText: string,
  context: string | undefined,
  withSchema: boolean,
): string {
  const sections = [variantText];
  if (context) sections.push(`Context about the application and the recording:\n${context}`);
  if (withSchema) sections.push(BUG_REPORT_OUTPUT_SECTION);
  return sections.join("\n\n");
}

/**
 * Rough native-mode input estimate. Observed on gemini-3.8-flash: a 15 s
 * 480x800 clip at 2 fps (30 frames) cost 1800 VIDEO tokens, i.e. ~60 tokens per
 * sampled frame at the default resolution; Google documents ~32 tokens/s for an
 * audio track. Higher `mediaResolution` tiers cost more per frame.
 */
function estimateNativeInputTokens(
  durationSeconds: number,
  fps: number,
  resolution: NativeResolution,
): number {
  const perFrame = { default: 60, low: 60, medium: 260, high: 260 }[resolution];
  return Math.round(durationSeconds * fps * perFrame + durationSeconds * 32);
}

function withCost(
  usage: VideoUsage | undefined,
  provider: ProviderName,
  model: string,
): VideoUsage | undefined {
  if (!usage) return undefined;
  const cost = calculateCost(provider, model, usage.inputTokens, usage.outputTokens);
  return cost === undefined ? usage : { ...usage, estimatedCost: cost };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function main(): Promise<void> {
  const cli = await parseCli();

  const videoStat = await stat(cli.videoPath).catch(() =>
    fail(`video not found: ${cli.videoPath}`),
  );
  const mimeType = getVideoMimeFromExtension(cli.videoPath);
  if (!mimeType)
    fail(`unsupported video extension "${extname(cli.videoPath)}" (use .mp4, .webm, .mov, .mkv)`);
  const videoBytes = await readFile(cli.videoPath);
  const durationSeconds = await probeDurationSeconds(cli.videoPath);
  const filename = basename(cli.videoPath);
  const stem = filename.slice(0, filename.length - extname(filename).length);

  const expectedPath = cli.expectedPath ?? join(dirname(cli.videoPath), `${stem}.expected.md`);
  const expected = await readFile(expectedPath, "utf8").catch(() => undefined);

  const startedAt = new Date();
  const runId = timestampId(startedAt);
  const outDir = cli.outDir ? resolve(cli.outDir) : join(RESULTS_ROOT, stem, runId);
  await mkdir(outDir, { recursive: true });

  console.log(
    `Video: ${cli.videoPath} (${(videoStat.size / 1024 / 1024).toFixed(2)} MB, ${durationSeconds.toFixed(1)} s, ${mimeType})`,
  );
  console.log(
    `Models: ${cli.models.join(", ")} · modes: ${cli.modes.join(", ")} · reps: ${cli.reps}`,
  );
  console.log(
    `fps ${cli.fps} · resolution ${cli.resolution} · effort ${cli.effort} · maxTokens ${cli.maxTokens}`,
  );
  console.log(`Prompt: ${cli.promptVariant}${cli.context ? " + context" : ""}`);
  if (expected) console.log(`Ground truth: ${expectedPath}`);
  if (cli.modes.includes("native")) {
    console.log(
      `Native input estimate: ~${estimateNativeInputTokens(durationSeconds, cli.fps, cli.resolution)} tokens per call (rough)`,
    );
  }
  console.log(`Results: ${outDir}\n`);

  const records: VideoRunRecord[] = [];
  for (const model of cli.models) {
    const provider = inferProvider(model);
    for (const mode of cli.modes) {
      if (mode === "native" && provider !== "google") {
        console.warn(
          `skip ${model} native: native video delivery is only implemented for Google models\n`,
        );
        continue;
      }
      for (let rep = 1; rep <= cli.reps; rep++) {
        const label = `${model} · ${mode} · rep ${rep}`;
        console.log(`▶ ${label}`);
        const promptText = buildPrompt(cli.promptText, cli.context, mode === "native");
        const t0 = Date.now();
        const base: Omit<VideoRunRecord, "status" | "durationSeconds"> = {
          version: 1,
          runId,
          video: {
            path: cli.videoPath,
            filename,
            sha256: sha256(videoBytes),
            bytes: videoStat.size,
            mimeType,
            durationSeconds,
          },
          model,
          provider,
          mode,
          rep,
          settings: {
            fps: cli.fps,
            reasoningEffort: cli.effort,
            maxTokens: cli.maxTokens,
            ...(mode === "native" ? { resolution: cli.resolution } : { maxFrames: cli.maxFrames }),
          },
          prompt: {
            variant: cli.promptVariant,
            ...(cli.context && { context: cli.context }),
            hash: sha256(promptText),
            text: promptText,
          },
          startedAt: new Date().toISOString(),
        };

        let record: VideoRunRecord;
        try {
          if (mode === "native") {
            const result = await runNativeCall({
              model,
              videoPath: cli.videoPath,
              mimeType,
              fps: cli.fps,
              resolution: cli.resolution,
              reasoningEffort: cli.effort,
              maxTokens: cli.maxTokens,
              inlineLimitBytes: videoBenchConfig.inlineLimitBytes,
              prompt: promptText,
              log: (message) => {
                console.log(message);
              },
            });
            const parsed = BugReportSchema.safeParse(JSON.parse(result.text));
            if (!parsed.success) {
              throw new Error(`response did not match BugReportSchema: ${parsed.error.message}`);
            }
            record = {
              ...base,
              settings: { ...base.settings, delivery: result.delivery },
              status: "ok",
              durationSeconds: (Date.now() - t0) / 1000,
              report: parsed.data,
              usage: withCost(result.usage, provider, model),
              rawText: result.text,
            };
          } else {
            const result = await runFramesCall({
              model,
              videoPath: cli.videoPath,
              durationSeconds,
              fps: cli.fps,
              maxFrames: cli.maxFrames,
              reasoningEffort: cli.effort,
              maxTokens: cli.maxTokens,
              prompt: promptText,
            });
            const usage = result.askResult.usage;
            record = {
              ...base,
              settings: { ...base.settings, frameTimestampsSeconds: result.frameTimestampsSeconds },
              status: "ok",
              durationSeconds: (Date.now() - t0) / 1000,
              report: result.report,
              usage: usage
                ? withCost(
                    {
                      inputTokens: usage.inputTokens,
                      outputTokens: usage.outputTokens,
                      ...(usage.reasoningTokens !== undefined && {
                        reasoningTokens: usage.reasoningTokens,
                      }),
                    },
                    provider,
                    model,
                  )
                : undefined,
            };
          }
          const bugs = record.report?.bugs ?? [];
          console.log(
            `  ✓ ${bugs.length} bug(s) in ${record.durationSeconds.toFixed(1)} s` +
              (record.usage
                ? ` · ${record.usage.inputTokens} in / ${record.usage.outputTokens} out`
                : "") +
              (record.usage?.estimatedCost !== undefined
                ? ` · $${record.usage.estimatedCost.toFixed(4)}`
                : ""),
          );
          for (const bug of bugs) {
            console.log(
              `    - [${bug.startTimeSeconds.toFixed(1)}s] (${bug.severity}) ${bug.title}`,
            );
          }
        } catch (error) {
          record = {
            ...base,
            status: "error",
            durationSeconds: (Date.now() - t0) / 1000,
            error: errorMessage(error),
          };
          console.log(`  ✗ ${record.error}`);
        }
        console.log("");
        records.push(record);
        const safeModel = model.replaceAll("/", "__");
        await writeFile(
          join(outDir, `${safeModel}.${mode}.rep${rep}.json`),
          JSON.stringify(record, null, 2) + "\n",
          "utf8",
        );
      }
    }
  }

  const report = renderReport({ records, expected });
  const reportPath = join(outDir, "REPORT.md");
  await writeFile(reportPath, report, "utf8");
  if (!cli.quiet) console.log(report);
  console.log(`\nReport written to ${reportPath}`);
  if (records.some((r) => r.status === "error")) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exit(1);
});
