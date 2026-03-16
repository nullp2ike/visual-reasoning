import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import sharp from "sharp";
import { VisualAIImageError } from "../errors.js";
import type { NormalizedImage, SupportedMimeType } from "../types.js";

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

function isFilePath(input: string): boolean {
  return (
    input.startsWith("/") ||
    input.startsWith("./") ||
    input.startsWith("../") ||
    input.includes("\\")
  );
}

function isUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

function isBase64Image(input: string): boolean {
  return (
    input.startsWith("iVBOR") || // PNG  (0x89 0x50 0x4E 0x47)
    input.startsWith("/9j/") || // JPEG (0xFF 0xD8 0xFF)
    input.startsWith("R0lGOD") || // GIF  (0x47 0x49 0x46)
    input.startsWith("UklGR") // WebP (0x52 0x49 0x46 0x46)
  );
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
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new VisualAIImageError(
      `Failed to fetch image from URL: ${url} — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new VisualAIImageError(
      `Failed to fetch image from URL: ${url} — HTTP ${response.status}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
  const mimeType =
    contentType && isSupportedMimeType(contentType) ? contentType : detectMimeType(data);

  return { data, mimeType };
}

function loadFromBase64(input: string): { data: Buffer; mimeType: SupportedMimeType } {
  // Handle data URLs: data:image/png;base64,iVBOR...
  let base64Data = input;
  let mimeType: SupportedMimeType | undefined;

  if (input.startsWith("data:")) {
    const match = /^data:(image\/[^;]+);base64,(.+)$/.exec(input);
    if (!match?.[1] || !match[2]) {
      throw new VisualAIImageError("Invalid data URL format");
    }
    if (!isSupportedMimeType(match[1])) {
      throw new VisualAIImageError(`Unsupported image format: ${match[1]}`);
    }
    mimeType = match[1];
    base64Data = match[2];
  }

  // Validate base64 characters
  if (!/^[A-Za-z0-9+/\n\r]+=*$/.test(base64Data)) {
    throw new VisualAIImageError("Invalid base64 string");
  }

  const data = Buffer.from(base64Data, "base64");

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
    } else if (input.startsWith("data:")) {
      ({ data, mimeType } = loadFromBase64(input));
    } else if (isBase64Image(input)) {
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
