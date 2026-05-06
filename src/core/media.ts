import type { Frame, MediaInput, NormalizedImage, VideoSamplingOptions } from "../types.js";
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
 * Single entry point used by the client. Auto-detects whether `input` is an
 * image or a video and returns a uniform `NormalizedMedia` envelope.
 */
export async function normalizeMedia(
  input: MediaInput,
  videoOptions?: VideoSamplingOptions,
): Promise<NormalizedMedia> {
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
