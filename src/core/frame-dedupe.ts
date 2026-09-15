import sharp from "sharp";
import { VisualAIVideoError } from "../errors.js";
import type { Frame, FrameDedupeOptions } from "../types.js";

/**
 * Longer edge of the grayscale thumbnail frames are compared on. 1568x880
 * becomes 256x144 (36,864 px): a 300x60 toast still covers ~490 px, while a
 * 2x16 text caret shrinks to ~3 px.
 */
const DEDUPE_THUMBNAIL_EDGE = 256;

/**
 * Per-pixel gray-level delta (out of 255) a thumbnail pixel must exceed to
 * count as changed. Sits above JPEG `-q:v 3` and codec re-quantisation noise,
 * which stays under ~10 levels once averaged down to thumbnail size.
 */
const DEDUPE_PIXEL_TOLERANCE = 24;

/**
 * Default fraction of thumbnail pixels that must change for a frame to be kept.
 * 0.1% is ~37 px of a 256x144 thumbnail: a 37x37 px region on a 1568x880 frame.
 */
export const DEFAULT_DEDUPE_THRESHOLD = 0.001;

export interface ResolvedDedupeOptions {
  readonly enabled: boolean;
  readonly threshold: number;
}

/** Grayscale thumbnail used to compare two frames. */
export interface FrameSignature {
  readonly width: number;
  readonly height: number;
  /** One byte per pixel, row-major. */
  readonly pixels: Buffer;
}

/**
 * Normalizes a `dedupe` option into an explicit `{ enabled, threshold }` pair,
 * throwing `VisualAIVideoError` for a threshold outside `(0, 1]`. Call this
 * before any expensive work so an invalid option fails fast.
 */
export function resolveDedupeOptions(raw: FrameDedupeOptions | undefined): ResolvedDedupeOptions {
  if (raw === undefined || raw === true) {
    return { enabled: true, threshold: DEFAULT_DEDUPE_THRESHOLD };
  }
  if (raw === false) {
    return { enabled: false, threshold: DEFAULT_DEDUPE_THRESHOLD };
  }
  const threshold = raw.threshold ?? DEFAULT_DEDUPE_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new VisualAIVideoError(
      `Invalid dedupe threshold: ${String(threshold)}. Must be a finite number in (0, 1].`,
    );
  }
  return { enabled: true, threshold };
}

/**
 * Decodes a frame into a small single-channel grayscale thumbnail. Alpha is
 * flattened onto white first so RGBA inputs produce one channel, not two.
 */
export async function frameSignature(frame: Frame): Promise<FrameSignature> {
  try {
    const { data, info } = await sharp(frame.data)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .greyscale()
      .resize(DEDUPE_THUMBNAIL_EDGE, DEDUPE_THUMBNAIL_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, pixels: data };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new VisualAIVideoError(
      `Failed to decode frame ${frame.index} (${frame.timestampSeconds.toFixed(2)}s) ` +
        `for change detection: ${reason}`,
    );
  }
}

/** Fraction of pixels whose gray level differs by more than the tolerance. */
function changedFraction(a: FrameSignature, b: FrameSignature): number {
  if (a.width !== b.width || a.height !== b.height) {
    return 1;
  }
  let changed = 0;
  for (let i = 0; i < a.pixels.length; i++) {
    if (Math.abs((a.pixels[i] ?? 0) - (b.pixels[i] ?? 0)) > DEDUPE_PIXEL_TOLERANCE) {
      changed++;
    }
  }
  return changed / a.pixels.length;
}

/**
 * Returns `frame` with the given index. A new object is built field by field
 * so the source's lazy `base64` getter is forwarded rather than evaluated, as
 * object spread would do.
 */
function reindex(frame: Frame, index: number): Frame {
  if (frame.index === index) {
    return frame;
  }
  return {
    data: frame.data,
    mimeType: frame.mimeType,
    get base64(): string {
      return frame.base64;
    },
    timestampSeconds: frame.timestampSeconds,
    index,
  };
}

/**
 * Drops frames that did not visibly change from the most recently kept frame.
 * The first frame is always kept; the last is not treated specially. Surviving
 * frames are re-indexed contiguously so `frameReferences` and the timeline
 * prompt line up with `frames.timestampsSeconds`.
 *
 * @throws {VisualAIVideoError} For an invalid threshold or an undecodable frame.
 */
export async function dedupeFrames(
  frames: readonly Frame[],
  options: FrameDedupeOptions | undefined,
): Promise<{ frames: Frame[]; dropped: number }> {
  const { enabled, threshold } = resolveDedupeOptions(options);
  if (!enabled || frames.length < 2) {
    return { frames: [...frames], dropped: 0 };
  }

  const signed = await Promise.all(
    frames.map(async (frame) => ({ frame, signature: await frameSignature(frame) })),
  );

  const [first, ...rest] = signed;
  if (first === undefined) {
    return { frames: [], dropped: 0 };
  }

  const kept: Frame[] = [first.frame];
  let lastKept = first.signature;
  for (const { frame, signature } of rest) {
    if (changedFraction(lastKept, signature) >= threshold) {
      kept.push(frame);
      lastKept = signature;
    }
  }

  return {
    frames: kept.map((frame, index) => reindex(frame, index)),
    dropped: frames.length - kept.length,
  };
}
