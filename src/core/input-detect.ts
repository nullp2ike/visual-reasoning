/**
 * Shared helpers for classifying string-shaped media inputs (paths, URLs,
 * data URLs, base64) and for the side-effecting loaders both `image.ts` and
 * `video.ts` rely on.
 */

export function isFilePath(input: string): boolean {
  return (
    input.startsWith("/") ||
    input.startsWith("./") ||
    input.startsWith("../") ||
    input.includes("\\")
  );
}

export function isUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

export function isDataUrl(input: string): boolean {
  return input.startsWith("data:");
}

/**
 * Parses a base64 data URL of the form `data:<mime>;base64,<payload>`.
 * Returns `null` for any other shape so callers can dispatch.
 */
export function parseDataUrl(input: string): { mimeType: string; base64Payload: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(input);
  if (!match?.[1] || !match[2]) return null;
  return { mimeType: match[1], base64Payload: match[2] };
}

/**
 * Validates and decodes a raw base64 payload. Throws on malformed input.
 * Callers are responsible for sniffing MIME from the resulting bytes.
 */
export function decodeBase64(payload: string): Buffer {
  if (!/^[A-Za-z0-9+/\n\r]+=*$/.test(payload)) {
    throw new Error("Invalid base64 string");
  }
  return Buffer.from(payload, "base64");
}

/** Quick prefix check for the four image formats the library accepts. */
export function looksLikeImageBase64(input: string): boolean {
  return (
    input.startsWith("iVBOR") || // PNG  (0x89 0x50 0x4E 0x47)
    input.startsWith("/9j/") || // JPEG (0xFF 0xD8 0xFF)
    input.startsWith("R0lGOD") || // GIF  (0x47 0x49 0x46)
    input.startsWith("UklGR") // WebP (0x52 0x49 0x46 0x46)
  );
}

/**
 * Quick prefix check for video base64 payloads. Catches WebM/Matroska
 * (EBML header `1A 45 DF A3` → `GkXf`) and ISO BMFF MP4/MOV variants whose
 * first three bytes are `00 00 00` (size prefix) → `AAAA`.
 *
 * `AAAA` is permissive (any binary starting with three zero bytes matches),
 * so callers must follow up with a magic-byte sniff before treating the
 * payload as video.
 */
export function looksLikeVideoBase64(input: string): boolean {
  return input.startsWith("GkXf") || input.startsWith("AAAA");
}

export async function fetchToBuffer(
  url: string,
  timeoutMs: number,
): Promise<{ data: Buffer; contentType: string | null }> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
  return { data, contentType };
}
