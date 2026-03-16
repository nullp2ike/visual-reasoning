---
title: "Base64 screenshots misidentified as file paths in image normalization"
date: 2026-03-09
category: logic-errors
tags:
  - image-normalization
  - base64
  - webdriverio
  - playwright
  - detection-logic
  - mime-type
severity: high
components:
  - src/core/image.ts
  - tests/core/image.test.ts
symptoms:
  - Raw base64 screenshots from WebDriverIO or Playwright fail with file-not-found errors
  - JPEG base64 strings starting with /9j/ treated as absolute file paths
  - Base64 strings containing / characters routed to loadFromFilePath()
  - Incorrect MIME type (image/png) applied to non-PNG base64 images
---

# Base64 Screenshots Misidentified as File Paths

## Problem

The `normalizeImage()` pipeline in `src/core/image.ts` misclassified raw base64-encoded screenshots as file paths, breaking integration with WebDriverIO (`browser.takeScreenshot()`) and Playwright (`page.screenshot({ encoding: 'base64' })`).

Users had to wrap screenshots in data URLs as a workaround:

```typescript
// Workaround that should not have been necessary
const toDataUrl = (base64: string) => `data:image/png;base64,${base64}`;
screenshot = toDataUrl(await browser.takeScreenshot());
```

## Root Cause

Two issues in `isFilePath()`:

1. **`input.includes("/")`** matched any string containing `/`. The base64 alphabet includes `/` as a valid character, so virtually all base64 strings of meaningful length contain it.

2. **JPEG base64 starts with `/9j/`**, which matched `startsWith("/")` — the absolute path check. Every raw JPEG screenshot looked like an absolute Unix path.

The detection order compounded the problem: `isFilePath` ran before any raw base64 detection, so base64 strings were misclassified before they could be recognized as image data.

A secondary bug: `loadFromBase64()` hardcoded `mimeType ?? "image/png"` as the fallback, silently mislabeling JPEG, WebP, and GIF inputs.

## Solution

### 1. Added `isBase64Image()` detection (src/core/image.ts)

Detects raw base64 by checking for known magic byte prefixes in their base64-encoded form:

```typescript
function isBase64Image(input: string): boolean {
  return (
    input.startsWith("iVBOR") || // PNG  (0x89 0x50 0x4E 0x47)
    input.startsWith("/9j/") || // JPEG (0xFF 0xD8 0xFF)
    input.startsWith("R0lGOD") || // GIF  (0x47 0x49 0x46)
    input.startsWith("UklGR") // WebP (0x52 0x49 0x46 0x46)
  );
}
```

### 2. Reordered detection chain

`isBase64Image` is checked **before** `isFilePath`:

```
URL -> data: URI -> isBase64Image -> isFilePath -> base64 fallback
```

### 3. Removed `input.includes("/")` from `isFilePath`

This was the root cause and was redundant. The `startsWith` checks (`/`, `./`, `../`) already cover legitimate absolute and relative paths. Windows paths are covered by `includes("\\")`.

### 4. Fixed MIME type fallback

```typescript
// Before: return { data, mimeType: mimeType ?? "image/png" };
return { data, mimeType: mimeType ?? detectMimeType(data) };
```

## Key Insight

Base64 and file paths share the `/` character. Naive string heuristics like `includes("/")` cannot distinguish them. The fix is to check for known base64 magic-byte prefixes first — these are deterministic, format-specific, and unambiguous — so that the inherently fuzzy file path heuristic never sees input it cannot correctly classify.

## Prevention Strategies

- **Order detection from most specific to least specific.** Base64 magic-byte prefixes and data URI prefixes are unambiguous; file path heuristics are fuzzy. Check the precise signals first.
- **Never silently fall back on MIME type inference.** A hardcoded fallback like `"image/png"` masks bugs. Use actual format detection (`detectMimeType`) or throw an error.
- **Test with real encoded images, not just synthetic strings.** Encode actual JPEG/PNG/WebP/GIF files to base64 and run through the normalizer. This catches prefix collisions that synthetic test data misses.

## Related Documentation

- Original library plan: `docs/plans/2026-02-16-feat-visual-ai-assertions-library-plan.md` (image handling spec in Phase 2)
- Integration bugs doc: `docs/solutions/integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md`
- Composable blocks best practices: `docs/solutions/best-practices/composable-prompt-blocks-and-api-consistency.md`
