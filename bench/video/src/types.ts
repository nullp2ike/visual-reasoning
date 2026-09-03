import { z } from "zod";
import { BugReportSchema } from "./schema.js";

export const VideoUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  reasoningTokens: z.number().optional(),
  /** Per-modality prompt token breakdown (VIDEO / AUDIO / TEXT), when the provider reports it. */
  inputTokensByModality: z.record(z.number()).optional(),
  estimatedCost: z.number().optional(),
});
export type VideoUsage = z.infer<typeof VideoUsageSchema>;

/** One (video, model, mode, rep) execution, as persisted under bench/video/results/. */
export const VideoRunRecordSchema = z.object({
  version: z.literal(1),
  runId: z.string(),
  video: z.object({
    path: z.string(),
    filename: z.string(),
    sha256: z.string(),
    bytes: z.number(),
    mimeType: z.string(),
    durationSeconds: z.number(),
  }),
  model: z.string(),
  provider: z.string(),
  mode: z.enum(["native", "frames"]),
  rep: z.number().int().positive(),
  settings: z.object({
    fps: z.number(),
    reasoningEffort: z.string(),
    maxTokens: z.number(),
    /** Native mode only. */
    resolution: z.string().optional(),
    /** Native mode only: whether bytes went inline or through the Files API. */
    delivery: z.enum(["inline", "file"]).optional(),
    /** Frames mode only. */
    maxFrames: z.number().optional(),
    /** Frames mode only: timestamps of the frames the model actually saw. */
    frameTimestampsSeconds: z.array(z.number()).optional(),
  }),
  prompt: z.object({
    variant: z.string(),
    context: z.string().optional(),
    /** sha256 of the full prompt text sent to the model. */
    hash: z.string(),
    text: z.string(),
  }),
  startedAt: z.string(),
  durationSeconds: z.number(),
  status: z.enum(["ok", "error"]),
  report: BugReportSchema.optional(),
  error: z.string().optional(),
  usage: VideoUsageSchema.optional(),
  /** The raw model text, kept for debugging parse failures. */
  rawText: z.string().optional(),
});
export type VideoRunRecord = z.infer<typeof VideoRunRecordSchema>;
