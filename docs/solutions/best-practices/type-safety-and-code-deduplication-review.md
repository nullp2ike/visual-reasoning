---
title: Type-safety gaps, code duplication, and dead code cleanup after reasoning effort support
date: 2026-03-05
status: verified
category: best-practices
tags:
  [
    type-safety,
    refactoring,
    dead-code-removal,
    code-duplication,
    reasoning-effort,
    openai-responses-api,
    anthropic-thinking-api,
  ]
modules:
  [
    src/core/client.ts,
    src/core/pricing.ts,
    src/core/image.ts,
    src/providers/anthropic.ts,
    src/providers/openai.ts,
    src/providers/google.ts,
    src/providers/error-mapper.ts,
  ]
severity: low
symptoms: Code review after adding xhigh reasoning effort support and migrating OpenAI to Responses API revealed loose typing, duplicated error-handling logic across providers, and dead code paths
root_cause: Incremental feature additions introduced Record<string, ...> maps instead of leveraging union types, copy-pasted mapError/parseRetryAfter across three provider files, and left behind a redundant normalize wrapper and unreachable model fallback
---

# Type Safety and Code Deduplication Review

## Problem

After adding reasoning effort support (`"low" | "medium" | "high" | "xhigh"`) and migrating the OpenAI driver from Chat Completions to the Responses API, a code review uncovered several type-safety gaps and code duplication issues across the provider layer:

1. **Loose typing** -- `Record<string, ...>` used for maps where only known provider names or effort levels are valid
2. **Duplicated error handling** -- identical `mapError()` and `parseRetryAfter()` functions in all 3 provider drivers
3. **Redundant wrapper** -- `normalize()` in client.ts that just delegated to `normalizeImage()`
4. **Dead code** -- unreachable `?? provider` fallback after `DEFAULT_MODELS` was typed
5. **Double allocation** -- `sharp(data)` called twice in `resizeIfNeeded()` (once for metadata, once for resize)

## Root Cause

These issues stemmed from incremental development: features were added one provider at a time, each copying boilerplate from the previous driver. The original types used permissive `string` record keys rather than leveraging the union types (`ProviderName`, `ReasoningEffort`) that already existed in `src/types.ts`. The normalize wrapper and model fallback were artifacts of earlier refactors that were never cleaned up.

## Solution

### 1. Type-safe provider maps

Changed `Record<string, string>` to `Record<ProviderName, string>` for `DEFAULT_MODELS`, `Record<string, number>` to `Record<ReasoningEffort, number>` for `GOOGLE_THINKING_BUDGET`, and typed `calculateCost`'s provider param as `ProviderName`.

```typescript
// src/core/client.ts
const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5-mini",
  google: "gemini-2.5-flash",
};

// src/providers/google.ts
const GOOGLE_THINKING_BUDGET: Record<ReasoningEffort, number> = {
  low: 1024,
  medium: 8192,
  high: 24576,
  xhigh: 24576,
};

// src/core/pricing.ts
export function calculateCost(
  provider: ProviderName,  // was: string
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | undefined { ... }
```

### 2. Shared error mapper

Extracted duplicated `mapError()` and `parseRetryAfter()` from all 3 providers into `src/providers/error-mapper.ts`. Google's version previously lacked retry-after parsing -- now gets it for free.

```typescript
// src/providers/error-mapper.ts
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

// Each driver now just does:
} catch (err) {
  throw mapProviderError(err);
}
```

### 3. Removed redundant normalize wrapper

```typescript
// Before (client.ts):
async function normalize(input: ImageInput): Promise<NormalizedImage> {
  return normalizeImage(input); // pointless wrapper
}

// After: all call sites use normalizeImage() directly
const img = await normalizeImage(image);
```

### 4. Removed dead model fallback

After typing `DEFAULT_MODELS` as `Record<ProviderName, string>`, TypeScript guarantees every key exists, making the `?? provider` fallback unreachable:

```typescript
// Before:
const model = config.model ?? process.env.VISUAL_AI_MODEL ?? DEFAULT_MODELS[provider] ?? provider;

// After:
const model = config.model ?? process.env.VISUAL_AI_MODEL ?? DEFAULT_MODELS[provider];
```

### 5. Reused sharp pipeline

```typescript
// Before: sharp(data) called twice
const metadata = await sharp(data).metadata();
// ... check dimensions ...
return sharp(data).resize({ ... }).toBuffer();

// After: single pipeline instance
const pipeline = sharp(data);
const metadata = await pipeline.metadata();
// ... check dimensions ...
return pipeline.resize({ ... }).toBuffer();
```

### 6. API parameter verification

Confirmed against official docs that reasoning effort params are correct:

| Provider  | API Parameter                                                  | `"xhigh"` maps to      |
| --------- | -------------------------------------------------------------- | ---------------------- |
| Anthropic | `thinking: { type: "adaptive" }` + `output_config: { effort }` | `"max"`                |
| OpenAI    | `reasoning: { effort }` (Responses API)                        | `"xhigh"` (native)     |
| Google    | `thinkingConfig: { thinkingBudget }`                           | `24576` (same as high) |

## Prevention Strategies

1. **Use typed record keys** -- Any `Record<string, ...>` in production code should use a named union type (`ProviderName`, `ReasoningEffort`) instead of `string`. The compiler then catches misspelled or missing entries.
2. **Extract shared logic early** -- If two provider files need the same function, it belongs in a shared module. Don't copy-paste between drivers.
3. **Question wrappers** -- Before adding a function, ask: "What does this do that its callee does not?" If the answer is "nothing," call the original directly.
4. **Remove dead code after type narrowing** -- When you strengthen a type (e.g., `string` to `ProviderName`), check for fallback branches that become unreachable.
5. **Reuse expensive objects** -- Treat sharp pipelines (and similar I/O-bound constructors) like database connections: create once, chain operations.

## Checklist for Future Provider Changes

- [ ] New provider imports shared `mapProviderError` -- does not define its own
- [ ] All `Record` types use named union keys, not `string`
- [ ] Any `switch` on a union type has exhaustive coverage
- [ ] No function solely forwards to another function with the same signature
- [ ] Sharp pipeline created at most once per image operation
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes

## Related Documentation

- [Per-Call API Token and Cost Monitoring](per-call-api-cost-monitoring.md) -- established `calculateCost` and pricing table patterns
- [TypeScript Library Build Configuration](../build-errors/typescript-library-build-configuration.md) -- covers strict TypeScript, dynamic SDK imports, ESLint config
- [API Integration Bugs Undetectable by Mocked Tests](../integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md) -- documents DEFAULT_MODELS consistency requirements

## Files Changed

| File                            | Change                                                                     |
| ------------------------------- | -------------------------------------------------------------------------- |
| `src/core/client.ts`            | Typed `DEFAULT_MODELS`, removed normalize wrapper, removed dead fallback   |
| `src/core/pricing.ts`           | Typed `calculateCost` provider param as `ProviderName`                     |
| `src/core/image.ts`             | Reused sharp pipeline in `resizeIfNeeded`                                  |
| `src/providers/error-mapper.ts` | New: shared `mapProviderError` + `parseRetryAfter`                         |
| `src/providers/anthropic.ts`    | Uses shared `mapProviderError`, removed local `mapError`/`parseRetryAfter` |
| `src/providers/openai.ts`       | Uses shared `mapProviderError`, removed local `mapError`/`parseRetryAfter` |
| `src/providers/google.ts`       | Uses shared `mapProviderError`, typed `GOOGLE_THINKING_BUDGET`             |
| `.gitignore`                    | Added `.history/`                                                          |
