---
title: "Compare diff image feature: code review findings and fixes"
date: 2026-03-10
category: logic-errors
tags:
  - code-review
  - error-handling
  - validation
  - diff-image
  - pixelmatch
  - gemini
  - graceful-degradation
  - prompt-extraction
  - security-guard
  - test-coverage
severity: P1
modules:
  - src/core/diff.ts
  - src/core/client.ts
  - src/core/prompt.ts
  - src/providers/google.ts
  - src/types.ts
  - src/format.ts
  - tests/
resolved: true
---

# Compare Diff Image Feature: Code Review Findings and Fixes

A multi-agent code review of the "compare diff image" feature identified 10 findings (1 P1, 5 P2, 4 P3). All were resolved in a single commit. The feature adds optional diff image generation to the `compare()` method, supporting both pixel-level diffs (via pixelmatch) and AI-generated diffs (via Google Gemini).

## Root Cause Analysis

The findings fell into several categories of latent defects that would only surface under specific conditions (JS consumers, oversized images, provider failures):

1. **Error handling gap**: Diff generation failure crashed the entire `compare()` call, discarding a successful AI comparison result.
2. **Missing runtime validation**: TypeScript discriminated unions aren't enforced at runtime for JS consumers.
3. **Wrong error classification**: API response failures were thrown as `VisualAIConfigError` instead of `VisualAIProviderError`.
4. **Security**: No dimension guard on exported functions that allocate large buffers.
5. **Code organization**: Inline prompts, duplicated code blocks, unnecessary caching.

## Working Solution

### 1. Graceful Error Degradation

Diff operations are wrapped in `.catch()` / `try-catch` so failures degrade to `undefined` (no diff image) while preserving the AI comparison result:

```typescript
// src/core/client.ts
const aiCall = timedSendMessage([imgA, imgB], prompt);
const pixelDiffCall =
  options?.diffImage?.method === "pixel"
    ? generatePixelDiff(imgA, imgB, options.diffImage).catch((err: unknown) => {
        debugLog(config, "diff error", String(err));
        return undefined;
      })
    : Promise.resolve(undefined);

const [response, pixelDiffResult] = await Promise.all([aiCall, pixelDiffCall]);

let diffResult = pixelDiffResult;
if (!diffResult && options?.diffImage?.method === "ai") {
  try {
    diffResult = await generateAiDiff(imgA, imgB, options.diffImage, driver);
  } catch (err) {
    debugLog(config, "ai diff error", String(err));
  }
}

return {
  ...result,
  ...(diffResult ? { diffImage: diffResult } : {}),
  usage: processUsage("compare", response.usage, response.durationSeconds),
};
```

### 2. Runtime Validation for Discriminated Unions

TypeScript's `method: "pixel" | "ai"` only enforces at compile time. JS callers can pass any string. The fix widens to `string` for the comparison:

```typescript
// src/core/client.ts
if (options?.diffImage) {
  const method: string = options.diffImage.method;
  if (method !== "pixel" && method !== "ai") {
    throw new VisualAIConfigError(
      `Unknown diffImage method: "${method}". Supported: "pixel", "ai"`,
    );
  }
}
```

### 3. Security: Dimension Guards

A hard cap prevents memory exhaustion from extremely large images (4096x4096x4 = 64 MB per buffer):

```typescript
// src/core/diff.ts
const MAX_DIFF_DIMENSION = 4096;

if (width > MAX_DIFF_DIMENSION || height > MAX_DIFF_DIMENSION) {
  throw new VisualAIImageError(
    `Image dimensions ${width}x${height} exceed maximum ${MAX_DIFF_DIMENSION}x${MAX_DIFF_DIMENSION} for diff generation`,
  );
}
```

### 4. Error Class Correctness

- `VisualAIConfigError` for missing SDK / bad user configuration
- `VisualAIProviderError` for empty/unexpected API responses
- `VisualAIImageError` for invalid image data

```typescript
// src/providers/google.ts — provider errors for API failures
throw new VisualAIProviderError("Gemini image generation returned no response parts");

// Catch block re-throws correctly classified errors
if (err instanceof VisualAIProviderError) throw err;
throw mapProviderError(err);
```

### 5. Code Organization

- **Prompt extraction**: `buildAiDiffPrompt()` moved from inline in `diff.ts` to `src/core/prompt.ts`
- **Deduplication**: `toGeminiParts()` helper extracted in GoogleDriver
- **CompareResult/Zod divergence**: Documented with comment explaining `diffImage` is appended client-side
- **Simplified pixelmatch import**: Removed unnecessary module-level Promise cache; Node's `import()` caches natively

## Prevention Strategies

### Checklist for New Features

- [ ] Optional/enhancement features wrapped in try/catch with graceful degradation
- [ ] All prompt text in `src/core/prompt.ts` or `src/templates/*.ts`
- [ ] Error classes match failure mode (config vs provider vs image)
- [ ] Runtime validation for discriminated union inputs at public API boundaries
- [ ] No redundant sharp/image processing on already-normalized data
- [ ] Dimension/size guards before buffer allocation
- [ ] No duplicated logic (3+ lines appearing twice = extract helper)
- [ ] Zod/TS type alignment documented if intentionally divergent
- [ ] Test coverage for every output shape and error path
- [ ] No premature caching (dynamic `import()` is cached by the runtime)

### Anti-Patterns to Avoid

| Anti-pattern                                    | Why it causes bugs                                               | Fix                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| Letting optional features throw unhandled       | Kills the entire operation even though core result was fine      | Wrap in try/catch, return degraded result               |
| Wrong error class for failure mode              | Callers' retry/recovery logic triggers incorrectly               | Match error class to cause                              |
| Trusting TypeScript at runtime                  | JS consumers and deserialized JSON bypass type checks            | Validate with Zod or manual checks at public boundaries |
| Unbounded buffer allocation                     | Single call can allocate gigabytes from user-supplied dimensions | Enforce dimension limits before allocation              |
| Module-level Promise caches for dynamic imports | Adds complexity for zero benefit — Node caches natively          | Trust the runtime                                       |

## Related Documentation

### Feature Plan

- [docs/plans/2026-03-10-feat-compare-diff-image-output-plan.md](../../plans/2026-03-10-feat-compare-diff-image-output-plan.md)

### Related Solutions

- [code-review-composable-prompt-blocks-branch](../best-practices/code-review-composable-prompt-blocks-branch.md) — Precedent for multi-agent code review workflow
- [type-safety-and-code-deduplication-review](../best-practices/type-safety-and-code-deduplication-review.md) — TypeScript discriminated union patterns
- [consolidate-magic-strings-with-as-const-satisfies](../best-practices/consolidate-magic-strings-with-as-const-satisfies.md) — Typed constants for string literals
- [base64-misidentified-as-file-path](../logic-errors/base64-misidentified-as-file-path.md) — Image input handling institutional learning
- [api-integration-bugs-undetectable-by-mocked-tests](../integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md) — Testing real provider behavior

### Completed Todos

All 10 review findings tracked in `todos/001-complete-*` through `todos/010-complete-*`.
