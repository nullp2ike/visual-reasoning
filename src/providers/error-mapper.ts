import { VisualAIAuthError, VisualAIProviderError, VisualAIRateLimitError } from "../errors.js";

export function mapProviderError(err: unknown): Error {
  if (!(err instanceof Error)) {
    return new VisualAIProviderError(String(err));
  }

  const status = (err as { status?: number }).status;

  if (status === 401 || status === 403) {
    return new VisualAIAuthError(err.message);
  }
  if (status === 429) {
    const headers = (err as { headers?: Record<string, string> }).headers;
    const retryAfter = parseRetryAfter(headers?.["retry-after"]);
    return new VisualAIRateLimitError(err.message, retryAfter);
  }
  if (status !== undefined) {
    return new VisualAIProviderError(err.message, status);
  }

  return new VisualAIProviderError(err.message);
}

function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : undefined;
}
