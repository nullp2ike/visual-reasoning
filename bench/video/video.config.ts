import type { ReasoningEffortLevel } from "../../src/constants.js";

/**
 * Prompt variants for the video bug-hunting harness. Each variant is sent
 * verbatim (plus the optional `--context` block and the output-schema section)
 * to the model. Variant ids must be dot-free: they become part of result
 * filenames.
 */
export const VIDEO_PROMPT_VARIANTS = {
  /** The default: a broad QA-engineer brief that asks for every observable bug. */
  bugs: `You are a senior QA engineer reviewing a screen recording of a software application (web or mobile UI). Your job is to find every software bug that is visible in the recording.

Watch the entire video carefully. Track the UI state over time: what the user does, what the application shows in response, and whether that response is correct. Compare screens against each other for inconsistencies, and compare "before" and "after" states of every interaction.

Report a bug for anything a user or a QA engineer would file, for example:
- Functional: taps/clicks with no effect, wrong outcome, error messages, crashes, stuck or endless loading, wrong navigation, forms that accept invalid input or reject valid input, buttons that do the wrong thing.
- Visual / layout: overlapping, clipped, or misaligned elements, broken or missing images and icons, unexpected layout shifts, inconsistent styling between similar elements, truncated text, wrong theme colours.
- Content: typos, placeholder text (lorem ipsum, "{{variable}}", "undefined", "NaN", "null"), wrong or inconsistent data, wrong currency/date/number formatting, untranslated strings, wrong labels.
- State / data: counters or totals that do not add up, stale data after an update, lost user input, values that differ between screens that should agree, wrong item shown after selection.
- Performance / responsiveness: long spinners, janky or stuttering animation, flicker, elements rendering twice, content that pops in late.
- Accessibility: unreadable contrast, tiny tap targets, focus that disappears.

Rules:
- Report only what is observable in the video. Do not speculate about code or causes you cannot see.
- List each distinct bug once. If the same bug recurs, keep one entry and mention every occurrence in the evidence.
- Give timestamps in seconds from the start of the video for when the bug first becomes visible, as precisely as you can.
- Do not report as bugs: normal cursor movement, video compression artifacts, deliberate design choices, content partially visible at the edge of a scrolled viewport, or things that are merely stylistic preferences.
- Be concrete: name the screen, the element, what happened, and what should have happened instead.
- If you find no bugs, return an empty list. Do not pad the list with non-issues.`,
} as const;

export type VideoPromptVariantId = keyof typeof VIDEO_PROMPT_VARIANTS;

export const DEFAULT_VIDEO_PROMPT_VARIANT: VideoPromptVariantId = "bugs";

export function isVideoPromptVariantId(value: string): value is VideoPromptVariantId {
  return value in VIDEO_PROMPT_VARIANTS;
}

/** How the video reaches the model. */
export type VideoMode = "native" | "frames";

/** Gemini `mediaResolution` tier applied to the video (native mode only). */
export type NativeResolution = "default" | "low" | "medium" | "high";

export interface VideoBenchConfig {
  /** Model used when `--models` is omitted. Native mode requires a Google model. */
  readonly model: string;
  /** Default delivery mode. */
  readonly mode: VideoMode;
  /**
   * Frames per second the model samples the video at. Native mode passes this as
   * Gemini `videoMetadata.fps` (default 1.0; range (0, 24]). Frames mode passes
   * it to the library's ffmpeg sampler. UI bugs are often transient (a toast, a
   * flicker), so 2 fps is a reasonable trade-off between recall and tokens.
   */
  readonly fps: number;
  /** Native mode: Gemini media resolution tier. `default` sends no field. */
  readonly resolution: NativeResolution;
  /** Frames mode: upper bound on sampled frames (library hard cap is 60). */
  readonly maxFrames: number;
  readonly reasoningEffort: ReasoningEffortLevel;
  /**
   * Output token budget. Gemini thinking tokens share this budget, and a long
   * bug list at high effort can run several thousand tokens, so this is
   * generous. Gemini 3.8 Flash allows up to 64k.
   */
  readonly maxTokens: number;
  /** Repetitions per (model, mode) cell, for consistency measurement. */
  readonly reps: number;
  /**
   * Requests whose video payload exceeds this size go through the Gemini Files
   * API instead of inline bytes (Gemini's inline request limit is 20 MB).
   */
  readonly inlineLimitBytes: number;
}

export const videoBenchConfig: VideoBenchConfig = {
  model: "gemini-3.8-flash",
  mode: "native",
  fps: 2,
  resolution: "default",
  maxFrames: 60,
  reasoningEffort: "medium",
  maxTokens: 16384,
  reps: 1,
  inlineLimitBytes: 19 * 1024 * 1024,
};
