import { visualAI } from "../../../src/index.js";
import type { AskResult, Issue } from "../../../src/index.js";
import type { ReasoningEffortLevel } from "../../../src/constants.js";
import type { Bug, BugCategory, BugReport } from "./schema.js";

/**
 * Frame-sampled delivery: the library extracts frames with ffmpeg and sends
 * them to the provider as an ordered image timeline. This is the path any
 * `visual-ai-assertions` user gets today, so it is the baseline that native
 * video understanding is compared against. Works with any supported model.
 */
export interface FramesCallOptions {
  readonly model: string;
  readonly videoPath: string;
  readonly durationSeconds: number;
  readonly fps: number;
  readonly maxFrames: number;
  readonly reasoningEffort: ReasoningEffortLevel;
  readonly maxTokens: number;
  /** The variant prompt (without the schema section; `ask()` adds its own). */
  readonly prompt: string;
}

export interface FramesCallResult {
  readonly report: BugReport;
  readonly askResult: AskResult;
  readonly frameTimestampsSeconds: number[];
}

/**
 * `ask()` returns the library's generic `Issue` shape, which has no timestamp
 * field, so the model is asked to lead every description with `[Ns]`. That
 * prefix is parsed back out here.
 */
const TIMESTAMP_INSTRUCTION =
  'Start every issue description with the timestamp (seconds from the start of the video) at which the bug first becomes visible, in square brackets, e.g. "[3.5s] The Save button ...". Put what should have happened instead into the suggestion field.';

const TIMESTAMP_PREFIX = /^\s*\[(\d+(?:\.\d+)?)\s*s?\]\s*/i;

const CATEGORY_MAP: Record<Issue["category"], BugCategory> = {
  accessibility: "accessibility",
  "missing-element": "visual",
  layout: "layout",
  content: "content",
  styling: "visual",
  functionality: "functional",
  performance: "performance",
  other: "other",
};

function issueToBug(issue: Issue, fallbackTimestamp: number | null): Bug {
  const match = TIMESTAMP_PREFIX.exec(issue.description);
  const description = match ? issue.description.slice(match[0].length) : issue.description;
  const parsed = match?.[1] !== undefined ? Number(match[1]) : Number.NaN;
  const startTimeSeconds = Number.isFinite(parsed) ? parsed : (fallbackTimestamp ?? 0);
  const firstSentence = description.split(/(?<=[.!?])\s/, 1)[0] ?? description;
  return {
    title: firstSentence.length > 90 ? `${firstSentence.slice(0, 87)}...` : firstSentence,
    severity: issue.priority,
    category: CATEGORY_MAP[issue.category],
    startTimeSeconds,
    endTimeSeconds: null,
    screen: "",
    observed: description,
    expected: issue.suggestion,
    evidence: match ? `Reported at ${match[1]}s` : "",
    confidence: match ? "medium" : "low",
  };
}

export async function runFramesCall(options: FramesCallOptions): Promise<FramesCallResult> {
  const ai = visualAI({
    model: options.model,
    reasoningEffort: options.reasoningEffort,
    maxTokens: options.maxTokens,
    trackUsage: true,
  });

  const askResult = await ai.ask(options.videoPath, options.prompt, {
    instructions: [TIMESTAMP_INSTRUCTION],
    video: {
      fps: options.fps,
      maxFrames: options.maxFrames,
      // The library rejects clips longer than this before any provider call;
      // lift the 10 s default so the whole recording is eligible.
      maxDurationSeconds: Math.ceil(options.durationSeconds) + 1,
    },
  });

  const timestamps = askResult.frames?.timestampsSeconds ?? [];
  const referenced = askResult.frameReferences ?? [];
  const firstReferenced = referenced.length > 0 ? (timestamps[referenced[0] ?? -1] ?? null) : null;

  const report: BugReport = {
    summary: askResult.summary,
    userFlow: "",
    bugs: askResult.issues.map((issue) => issueToBug(issue, firstReferenced)),
  };

  return { report, askResult, frameTimestampsSeconds: timestamps };
}
