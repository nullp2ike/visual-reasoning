import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import sharp from "sharp";
import { VisualAIImageError } from "../errors.js";
import type { NormalizedImage, SupportedMimeType } from "../types.js";
import {
  decodeBase64,
  fetchToBuffer,
  isDataUrl,
  isFilePath,
  isUrl,
  looksLikeImageBase64,
  parseDataUrl,
} from "./input-detect.js";

const SUPPORTED_FORMATS: ReadonlySet<SupportedMimeType> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const EXTENSION_TO_MIME: Record<string, SupportedMimeType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const MAX_DIMENSION = 1568;
const URL_FETCH_TIMEOUT_MS = 10_000;

function isSupportedMimeType(value: string): value is SupportedMimeType {
  return SUPPORTED_FORMATS.has(value as SupportedMimeType);
}

function getMimeFromExtension(filePath: string): SupportedMimeType | undefined {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_TO_MIME[ext];
}

function detectMimeType(data: Buffer): SupportedMimeType {
  // Check magic bytes
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }
  if (
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "image/webp";
  }
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
    return "image/gif";
  }

  throw new VisualAIImageError("Unable to detect image format from file content");
}

async function resizeIfNeeded(data: Buffer, mimeType: SupportedMimeType): Promise<Buffer> {
  if (mimeType === "image/gif") {
    return data;
  }

  // Fast path for PNG: read dimensions directly from header bytes
  if (mimeType === "image/png" && data.length >= 24) {
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
      return data;
    }
  }

  // Fall back to sharp for other formats or when resizing is needed
  const pipeline = sharp(data);
  const metadata = await pipeline.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    return data;
  }

  return pipeline
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer();
}

async function loadFromFilePath(
  filePath: string,
): Promise<{ data: Buffer; mimeType: SupportedMimeType }> {
  let fileData: Buffer;
  try {
    fileData = await readFile(filePath);
  } catch (err) {
    throw new VisualAIImageError(
      `Failed to read image file: ${filePath} — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const mimeType = getMimeFromExtension(filePath) ?? detectMimeType(fileData);
  return { data: fileData, mimeType };
}

async function loadFromUrl(url: string): Promise<{ data: Buffer; mimeType: SupportedMimeType }> {
  let result: { data: Buffer; contentType: string | null };
  try {
    result = await fetchToBuffer(url, URL_FETCH_TIMEOUT_MS);
  } catch (err) {
    throw new VisualAIImageError(
      `Failed to fetch image from URL: ${url} — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const { data, contentType } = result;
  const mimeType =
    contentType && isSupportedMimeType(contentType) ? contentType : detectMimeType(data);

  return { data, mimeType };
}

function loadFromBase64(input: string): { data: Buffer; mimeType: SupportedMimeType } {
  // Handle data URLs: data:image/png;base64,iVBOR...
  let base64Data = input;
  let mimeType: SupportedMimeType | undefined;

  if (isDataUrl(input)) {
    const parsed = parseDataUrl(input);
    if (!parsed) {
      throw new VisualAIImageError("Invalid data URL format");
    }
    if (!isSupportedMimeType(parsed.mimeType)) {
      throw new VisualAIImageError(`Unsupported image format: ${parsed.mimeType}`);
    }
    mimeType = parsed.mimeType;
    base64Data = parsed.base64Payload;
  }

  let data: Buffer;
  try {
    data = decodeBase64(base64Data);
  } catch {
    throw new VisualAIImageError("Invalid base64 string");
  }

  if (data.length === 0) {
    throw new VisualAIImageError("Empty image data after base64 decode");
  }

  return { data, mimeType: mimeType ?? detectMimeType(data) };
}

export async function normalizeImage(
  input: Buffer | Uint8Array | string,
): Promise<NormalizedImage> {
  let data: Buffer;
  let mimeType: SupportedMimeType;

  if (Buffer.isBuffer(input)) {
    mimeType = detectMimeType(input);
    data = input;
  } else if (input instanceof Uint8Array) {
    const buf = Buffer.from(input);
    mimeType = detectMimeType(buf);
    data = buf;
  } else if (typeof input === "string") {
    if (isUrl(input)) {
      ({ data, mimeType } = await loadFromUrl(input));
    } else if (isDataUrl(input)) {
      ({ data, mimeType } = loadFromBase64(input));
    } else if (looksLikeImageBase64(input)) {
      ({ data, mimeType } = loadFromBase64(input));
    } else if (isFilePath(input)) {
      ({ data, mimeType } = await loadFromFilePath(input));
    } else {
      throw new VisualAIImageError(
        `Unrecognized image input: "${input.slice(0, 80)}". ` +
          `Expected a file path, URL, data URL, or base64-encoded image string.`,
      );
    }
  } else {
    throw new VisualAIImageError(
      "Invalid image input: expected Buffer, Uint8Array, file path, URL, or base64 string",
    );
  }

  data = await resizeIfNeeded(data, mimeType);

  let cachedBase64: string | undefined;
  return {
    data,
    mimeType,
    get base64(): string {
      if (cachedBase64 === undefined) {
        cachedBase64 = data.toString("base64");
      }
      return cachedBase64;
    },
  };
}
