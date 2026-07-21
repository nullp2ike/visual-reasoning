import { VisualAIVideoError } from "../errors.js";
import type {
  Frame,
  FramesInput,
  ImageInput,
  MediaInput,
  NormalizedImage,
  TimestampedFrameInput,
  VideoSamplingOptions,
} from "../types.js";
import { saveDebugFrames } from "./debug-frames.js";
import { normalizeImage } from "./image.js";
import {
  decodeBase64,
  isDataUrl,
  isFilePath,
  looksLikeVideoBase64,
  parseDataUrl,
} from "./input-detect.js";
import {
  DEFAULT_FPS,
  MAX_FRAMES_HARD_CAP,
  detectVideoMimeType,
  extractFrames,
  getVideoMimeFromExtension,
  resolveVideoToPath,
} from "./video.js";

export type NormalizedMedia =
  | { kind: "image"; image: NormalizedImage }
  | { kind: "video"; frames: Frame[]; durationSeconds: number };

// Only the first 12 bytes (16 base64 chars) are needed to sniff a magic-byte signature.
const VIDEO_MAGIC_BYTE_PREFIX_LEN = 16;

/**
 * Heuristically determines whether `input` is a video. Returns `true` only
 * when we have strong evidence: a recognized extension, a `data:video/*`
 * URL, or video magic bytes in the first 12 bytes of binary input. Anything
 * ambiguous returns `false` so the image pipeline gets a chance.
 *
 * URL inputs are not classified as video — the library does not fetch
 * remote videos.
 */
export function isVideoInput(input: MediaInput): boolean {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return detectVideoMimeType(buf) !== null;
  }

  if (typeof input !== "string") return false;

  if (isDataUrl(input)) {
    const parsed = parseDataUrl(input);
    return parsed?.mimeType.startsWith("video/") ?? false;
  }

  if (isFilePath(input)) {
    return getVideoMimeFromExtension(input) !== undefined;
  }

  // Bare base64 string — only treat as video when prefix + decoded magic
  // bytes both agree, to avoid stealing inputs from the image pipeline.
  if (looksLikeVideoBase64(input)) {
    try {
      const buf = decodeBase64(input.slice(0, VIDEO_MAGIC_BYTE_PREFIX_LEN));
      return detectVideoMimeType(buf) !== null;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Narrows an input to the pre-sampled `FramesInput` shape. Buffers, typed
 * arrays, and strings (all valid `MediaInput`s) are excluded so only a plain
 * `{ frames: [...] }` object matches.
 */
export function isFramesInput(input: unknown): input is FramesInput {
  return (
    typeof input === "object" &&
    input !== null &&
    !Buffer.isBuffer(input) &&
    !(input instanceof Uint8Array) &&
    Array.isArray((input as { frames?: unknown }).frames)
  );
}

function isTimestampedFrameInput(
  frame: ImageInput | TimestampedFrameInput,
): frame is TimestampedFrameInput {
  return (
    typeof frame === "object" &&
    !Buffer.isBuffer(frame) &&
    !(frame instanceof Uint8Array) &&
    "image" in frame
  );
}

/**
 * Normalizes pre-sampled frames into the same `{ kind: "video", frames,
 * durationSeconds }` envelope the video path produces, so everything
 * downstream (provider call, timeline prompt, frame metadata, timestamps,
 * frame references) works unchanged. Never loads ffmpeg.
 */
export async function normalizeFrames(input: FramesInput): Promise<NormalizedMedia> {
  const rawFrames = input.frames;
  const fps = input.fps ?? DEFAULT_FPS;

  if (rawFrames.length === 0) {
    throw new VisualAIVideoError("frames must be a non-empty array of image inputs");
  }
  if (rawFrames.length > MAX_FRAMES_HARD_CAP) {
    throw new VisualAIVideoError(
      `frames length ${rawFrames.length} exceeds the hard cap of ${MAX_FRAMES_HARD_CAP}. ` +
        `Pass fewer frames or open an issue if you need a larger limit.`,
    );
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new VisualAIVideoError(`Invalid fps: ${fps}. Must be a finite number > 0.`);
  }

  const frames: Frame[] = await Promise.all(
    rawFrames.map(async (raw, index): Promise<Frame> => {
      const timestamped = isTimestampedFrameInput(raw);
      const imageInput = timestamped ? raw.image : raw;
      const explicit = timestamped ? raw.timestampSeconds : undefined;
      const timestampSeconds = explicit ?? index / fps;
      if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
        throw new VisualAIVideoError(
          `Invalid timestampSeconds for frame ${index}: ${String(timestampSeconds)}. ` +
            `Must be a finite number >= 0.`,
        );
      }
      const image = await normalizeImage(imageInput);
      return {
        data: image.data,
        mimeType: image.mimeType,
        get base64(): string {
          return image.base64;
        },
        timestampSeconds,
        index,
      };
    }),
  );

  // Duration isn't known for a bare frame sequence; use the latest timestamp so
  // the timeline prompt and frame metadata report a sensible span.
  const durationSeconds = frames.reduce((max, f) => Math.max(max, f.timestampSeconds), 0);

  await saveDebugFrames(frames);
  return { kind: "video", frames, durationSeconds };
}

/**
 * Single entry point used by the client. Accepts pre-sampled frames or auto-detects
 * whether `input` is an image or a video, returning a uniform `NormalizedMedia`
 * envelope.
 */
export async function normalizeMedia(
  input: MediaInput | FramesInput,
  videoOptions?: VideoSamplingOptions,
): Promise<NormalizedMedia> {
  if (isFramesInput(input)) {
    return normalizeFrames(input);
  }

  if (isVideoInput(input)) {
    const { path, cleanup } = await resolveVideoToPath(input);
    try {
      const { frames, durationSeconds } = await extractFrames(path, videoOptions);
      await saveDebugFrames(frames);
      return { kind: "video", frames, durationSeconds };
    } finally {
      try {
        await cleanup();
      } catch {
        // Best-effort cleanup; do not mask the original error path.
      }
    }
  }

  const image = await normalizeImage(input);
  return { kind: "image", image };
}
