---
title: "feat: Add diff image output to compare()"
type: feat
status: completed
date: 2026-03-10
---

# Add Diff Image Output to compare()

## Overview

Add an optional `diffImage` parameter to `CompareOptions` that generates a visual diff image highlighting pixel-level or AI-annotated differences between the two compared images. The diff image is returned as a `Buffer` in the `CompareResult`. Disabled by default — no breaking changes.

## Problem Statement / Motivation

The current `compare()` method returns structured JSON (pass/fail, changes list, reasoning) but no visual artifact showing _where_ the differences are. In E2E test workflows, a visual diff image is the fastest way to understand what changed between a baseline and current screenshot. Test reporters (Playwright, Jest) can attach these images to test results for quick triage.

## Proposed Solution

Two diff generation methods behind a single `diffImage` option on `CompareOptions`:

1. **Pixel-level diff** (`method: 'pixel'`) — Uses `pixelmatch` for fast, deterministic, local comparison. No API cost. Configurable threshold and highlight color.
2. **AI-generated diff** (`method: 'ai'`) — Uses Gemini's image generation capability to produce a semantically annotated diff. Higher cost/latency, but understands meaningful vs. noise changes.

### API Design

```typescript
// src/types.ts — new types

type DiffImageMethod = "pixel" | "ai";

interface PixelDiffOptions {
  method: "pixel";
  threshold?: number; // 0-1, default 0.1 (pixelmatch default)
  color?: [number, number, number]; // RGB 0-255, default [255, 0, 0]
}

interface AiDiffOptions {
  method: "ai";
}

type DiffImageOptions = PixelDiffOptions | AiDiffOptions;

// Updated CompareOptions
interface CompareOptions {
  prompt?: string;
  edgeCaseRules?: readonly string[];
  diffImage?: DiffImageOptions; // NEW — opt-in per call
}

// Diff result metadata
interface DiffImageResult {
  data: Buffer; // PNG image buffer
  width: number;
  height: number;
  mimeType: "image/png";
  diffPixels: number; // only meaningful for pixel method
  totalPixels: number;
}

// Updated CompareResult
interface CompareResult {
  pass: boolean;
  reasoning: string;
  changes: ChangeEntry[];
  diffImage?: DiffImageResult; // NEW
  usage?: UsageInfo;
}
```

### Usage Examples

```typescript
// Pixel diff (most common)
const result = await client.compare(imgA, imgB, {
  diffImage: { method: "pixel" },
});
if (result.diffImage) {
  fs.writeFileSync("diff.png", result.diffImage.data);
  console.log(`${result.diffImage.diffPixels} pixels differ`);
}

// Pixel diff with custom sensitivity
const result = await client.compare(imgA, imgB, {
  diffImage: { method: "pixel", threshold: 0.3, color: [0, 255, 0] },
});

// AI-generated diff (Google provider only)
const result = await client.compare(imgA, imgB, {
  diffImage: { method: "ai" },
});
```

## Design Decisions

### D1: Dimension mismatch handling (pixel diff)

`pixelmatch` requires identical dimensions. When images differ in size after normalization:

- **Resize the smaller image** to match the larger image's dimensions using `sharp.resize({ fit: 'contain', background: transparent })`. This pads the smaller image with a transparent/white background rather than stretching it.
- The padding area itself will show as "diff" pixels, which is correct — the size difference _is_ a visual change.
- Document this behavior clearly.

### D2: Diff operates on post-normalization images

The pixel diff runs on the same normalized images sent to the AI provider. This ensures the diff reflects what the AI analyzed and avoids raw-image dimension/format issues. Both images have already been resized to within 1568x1568 and had their format detected.

### D3: Output format is always PNG

Regardless of input formats, the diff image is always PNG. This is lossless and preserves the overlay precisely. The `DiffImageResult.mimeType` is always `'image/png'`.

### D4: AI diff only supported with Google provider

When `method: 'ai'` is requested with Anthropic or OpenAI, throw `VisualAIConfigError` with a clear message: "AI-generated diff images are only supported with the Google (Gemini) provider." This follows the existing pattern of throwing on unsupported configuration.

### D5: Error handling — diff failure does not discard the AI result

If diff generation fails but the AI comparison succeeded:

- Return the `CompareResult` **without** `diffImage` (field is `undefined`)
- Log the error via `debugLog` so it's visible when `debug: true`
- Throw only if the AI comparison itself failed

Rationale: The primary value of `compare()` is the AI analysis. A diff failure should not destroy a successful comparison result. The `debugLog` makes failures visible without swallowing them silently.

### D6: pixelmatch as optional peer dependency

Follow the established pattern for optional dependencies:

- Add to `peerDependencies` and `peerDependenciesMeta` (optional: true)
- Dynamic import with clear error message: "pixelmatch not installed. Run: npm install pixelmatch"
- Also requires `pngjs` as a peer dep (pixelmatch operates on raw pixel data; pngjs encodes/decodes PNG)

### D7: Pixel diff runs in parallel with AI call

For `method: 'pixel'`, the diff is purely local (~10-50ms) and has no dependency on the AI result. Run it in `Promise.all` alongside the AI API call for zero additional latency.

For `method: 'ai'`, run sequentially after the AI comparison completes, since it requires a separate API call.

### D8: Threshold and color validation

- `threshold`: Must be a number between 0 and 1 (inclusive). Throw `VisualAIConfigError` if out of range.
- `color`: Each element must be an integer between 0 and 255. Throw `VisualAIConfigError` if invalid.
- These options are only available on `PixelDiffOptions` (enforced by TypeScript discriminated union — no runtime check needed for `method: 'ai'`).

### D9: DiffImageResult not part of Zod schema

The `CompareResultSchema` (Zod) validates the AI's JSON text response. `diffImage` is generated locally/separately and attached to the result _after_ Zod validation. The Zod schema remains unchanged — `diffImage` is added to the TypeScript `CompareResult` type only.

### D10: Phased implementation

**Phase 1:** `method: 'pixel'` — simpler, no API cost, deterministic, fully testable.
**Phase 2:** `method: 'ai'` — requires extending the Google driver to support image generation responses, more complex testing.

## Technical Approach

### Phase 1: Pixel Diff (`method: 'pixel'`)

#### 1.1 New types in `src/types.ts`

Add `DiffImageOptions` discriminated union, `DiffImageResult` interface. Update `CompareOptions` with optional `diffImage` field. Update `CompareResult` TypeScript type (NOT Zod schema) with optional `diffImage` field.

**Files:** [src/types.ts](src/types.ts)

```typescript
// New discriminated union
export interface PixelDiffOptions {
  method: "pixel";
  threshold?: number;
  color?: [number, number, number];
}

export interface AiDiffOptions {
  method: "ai";
}

export type DiffImageOptions = PixelDiffOptions | AiDiffOptions;

// New result type
export interface DiffImageResult {
  data: Buffer;
  width: number;
  height: number;
  mimeType: "image/png";
  diffPixels: number;
  totalPixels: number;
}

// Update CompareOptions
export interface CompareOptions {
  prompt?: string;
  edgeCaseRules?: readonly string[];
  diffImage?: DiffImageOptions;
}

// CompareResult TYPE gets diffImage (Zod schema stays unchanged)
export type CompareResult = z.infer<typeof CompareResultSchema> & {
  diffImage?: DiffImageResult;
};
```

#### 1.2 New diff module `src/core/diff.ts`

Single-responsibility module for diff image generation. Handles:

- Dynamic import of `pixelmatch` and `pngjs`
- Dimension matching (resize smaller to larger via sharp)
- Raw pixel extraction via sharp (`.raw().toBuffer()`)
- pixelmatch execution
- PNG encoding of diff output via pngjs
- Input validation (threshold range, color values)

**Files:** [src/core/diff.ts](src/core/diff.ts) (new)

```typescript
// src/core/diff.ts

import sharp from "sharp";
import type { NormalizedImage } from "../types.js";
import type { DiffImageResult, PixelDiffOptions } from "../types.js";
import { VisualAIConfigError, VisualAIImageError } from "../errors.js";

const DEFAULT_THRESHOLD = 0.1;
const DEFAULT_COLOR: [number, number, number] = [255, 0, 0];

function validatePixelDiffOptions(options: PixelDiffOptions): void {
  if (options.threshold !== undefined) {
    if (options.threshold < 0 || options.threshold > 1) {
      throw new VisualAIConfigError(
        `Diff threshold must be between 0 and 1, got: ${options.threshold}`,
      );
    }
  }
  if (options.color !== undefined) {
    for (const [i, val] of options.color.entries()) {
      if (!Number.isInteger(val) || val < 0 || val > 255) {
        throw new VisualAIConfigError(
          `Diff color values must be integers 0-255, got [${options.color}] (index ${i} = ${val})`,
        );
      }
    }
  }
}

async function ensureMatchingDimensions(
  imgA: NormalizedImage,
  imgB: NormalizedImage,
): Promise<{ bufA: Buffer; bufB: Buffer; width: number; height: number }> {
  const metaA = await sharp(imgA.data).metadata();
  const metaB = await sharp(imgB.data).metadata();
  const wA = metaA.width ?? 0;
  const hA = metaA.height ?? 0;
  const wB = metaB.width ?? 0;
  const hB = metaB.height ?? 0;

  const width = Math.max(wA, wB);
  const height = Math.max(hA, hB);

  // Resize both to the common dimensions (contain + white background)
  const toRaw = (img: NormalizedImage) =>
    sharp(img.data)
      .resize(width, height, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .ensureAlpha()
      .raw()
      .toBuffer();

  const [bufA, bufB] = await Promise.all([toRaw(imgA), toRaw(imgB)]);
  return { bufA, bufB, width, height };
}

export async function generatePixelDiff(
  imgA: NormalizedImage,
  imgB: NormalizedImage,
  options: PixelDiffOptions,
): Promise<DiffImageResult> {
  validatePixelDiffOptions(options);

  // Dynamic import of pixelmatch
  let pixelmatch: (
    img1: Buffer,
    img2: Buffer,
    output: Buffer,
    width: number,
    height: number,
    options?: object,
  ) => number;
  try {
    const mod = await import("pixelmatch");
    pixelmatch = (mod.default ?? mod) as typeof pixelmatch;
  } catch {
    throw new VisualAIConfigError("pixelmatch not installed. Run: npm install pixelmatch");
  }

  const { bufA, bufB, width, height } = await ensureMatchingDimensions(imgA, imgB);
  const totalPixels = width * height;
  const diffBuffer = Buffer.alloc(width * height * 4);

  const diffPixels = pixelmatch(bufA, bufB, diffBuffer, width, height, {
    threshold: options.threshold ?? DEFAULT_THRESHOLD,
    diffColor: options.color ?? DEFAULT_COLOR,
  });

  // Encode diff as PNG via sharp
  const pngData = await sharp(diffBuffer, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();

  return {
    data: pngData,
    width,
    height,
    mimeType: "image/png",
    diffPixels,
    totalPixels,
  };
}
```

#### 1.3 Update `compare()` in `src/core/client.ts`

- If `options.diffImage` is provided with `method: 'pixel'`, run `generatePixelDiff` in parallel with the AI API call
- If `method: 'ai'`, throw `VisualAIConfigError` (Phase 2)
- Wrap diff generation in try/catch: on failure, log via `debugLog` and return result without `diffImage`

**Files:** [src/core/client.ts](src/core/client.ts)

```typescript
// In compare() method — updated logic sketch:
async compare(imageA, imageB, options) {
  const [imgA, imgB] = await Promise.all([
    normalizeImage(imageA),
    normalizeImage(imageB),
  ]);
  const prompt = buildComparePrompt({
    userPrompt: options?.prompt,
    edgeCaseRules: options?.edgeCaseRules,
  });
  debugLog(config, 'compare prompt', prompt);

  // Build parallel tasks
  const aiCall = timedSendMessage([imgA, imgB], prompt);
  const diffCall = options?.diffImage
    ? generateDiffImage(imgA, imgB, options.diffImage, config)
    : undefined;

  const [response, diffResult] = await Promise.all([
    aiCall,
    diffCall ?? Promise.resolve(undefined),
  ]);

  debugLog(config, 'compare response', response.text);
  const result = parseCompareResponse(response.text);

  return {
    ...result,
    ...(diffResult && { diffImage: diffResult }),
    usage: processUsage('compare', response.usage, response.durationSeconds),
  };
}
```

Where `generateDiffImage` is a wrapper that:

- Validates `method: 'ai'` throws `VisualAIConfigError` (until Phase 2)
- Calls `generatePixelDiff` for `method: 'pixel'`
- Catches errors, logs via `debugLog`, returns `undefined`

#### 1.4 Update `formatCompareResult` in `src/format.ts`

When `diffImage` is present, append a summary line:

```
Diff image: 1568x1024 (4.2% pixels changed, 68,813 of 1,605,632)
```

**Files:** [src/format.ts](src/format.ts)

#### 1.5 Update public exports in `src/index.ts`

Export new types: `DiffImageOptions`, `PixelDiffOptions`, `AiDiffOptions`, `DiffImageResult`.

**Files:** [src/index.ts](src/index.ts)

#### 1.6 Add `pixelmatch` as optional peer dependency

**Files:** [package.json](package.json)

```json
{
  "peerDependencies": {
    "pixelmatch": ">=6.0.0"
  },
  "peerDependenciesMeta": {
    "pixelmatch": { "optional": true }
  }
}
```

#### 1.7 Tests

**New test file:** `tests/core/diff.test.ts`

- `generatePixelDiff` with two identical images → `diffPixels: 0`, valid PNG buffer
- `generatePixelDiff` with two different images → `diffPixels > 0`, valid PNG buffer
- `generatePixelDiff` with different dimension images → auto-resize, valid output
- Threshold validation: values outside 0-1 throw `VisualAIConfigError`
- Color validation: non-integer or out-of-range values throw `VisualAIConfigError`
- Missing `pixelmatch` → throws `VisualAIConfigError` with install instructions

**Updated test file:** `tests/core/client.test.ts`

- `compare()` without `diffImage` option → result has no `diffImage` field (backwards compatible)
- `compare()` with `{ diffImage: { method: 'pixel' } }` → result includes `diffImage` with valid metadata
- `compare()` with `{ diffImage: { method: 'ai' } }` → throws `VisualAIConfigError`

**Test fixtures:** Create two small (50x50) PNG test images in `tests/fixtures/`:

- `diff-base.png` — solid white with a blue square
- `diff-changed.png` — solid white with a red square (same position)

**Files:**

- [tests/core/diff.test.ts](tests/core/diff.test.ts) (new)
- [tests/core/client.test.ts](tests/core/client.test.ts) (update)
- [tests/fixtures/diff-base.png](tests/fixtures/diff-base.png) (new)
- [tests/fixtures/diff-changed.png](tests/fixtures/diff-changed.png) (new)

### Phase 2: AI-Generated Diff (`method: 'ai'`) — Follow-up

#### 2.1 Extend Google driver for image generation

Add a new method to `GoogleDriver` (not to the `ProviderDriver` interface) that calls Gemini with `responseModalities: ['IMAGE', 'TEXT']`. This keeps the driver interface clean.

**Files:** [src/providers/google.ts](src/providers/google.ts)

#### 2.2 New AI diff function in `src/core/diff.ts`

Add `generateAiDiff(imgA, imgB, driver)` that:

- Constructs a prompt asking for an annotated diff image
- Calls the Google driver's image generation method
- Extracts the image from the response
- Returns `DiffImageResult` (with `diffPixels: 0, totalPixels: 0` since AI can't provide exact counts)

**Files:** [src/core/diff.ts](src/core/diff.ts)

#### 2.3 Update `compare()` to support `method: 'ai'`

Remove the `VisualAIConfigError` throw for `method: 'ai'`. Run the AI diff call sequentially after the comparison.

**Files:** [src/core/client.ts](src/core/client.ts)

#### 2.4 Tests for AI diff

Mock the Google driver's image generation response. Verify the diff image is extracted and returned correctly. Test that non-Google providers throw `VisualAIConfigError`.

**Files:** [tests/core/diff.test.ts](tests/core/diff.test.ts)

## Acceptance Criteria

### Phase 1 (Pixel Diff)

- [x] `compare()` without `diffImage` option behaves identically to current behavior
- [x] `compare(a, b, { diffImage: { method: 'pixel' } })` returns a `DiffImageResult` with valid PNG buffer
- [x] Diff image correctly highlights changed pixels in red (default) or custom color
- [x] Images with different dimensions are auto-resized to match before diffing
- [x] `threshold` and `color` options are validated with clear error messages
- [x] Missing `pixelmatch` throws `VisualAIConfigError` with install command
- [x] `method: 'ai'` throws `VisualAIConfigError` indicating Phase 2
- [x] Diff generation failure does not prevent the AI comparison result from being returned
- [x] `formatCompareResult` includes diff summary when `diffImage` is present
- [x] `DiffImageOptions`, `DiffImageResult`, `PixelDiffOptions`, `AiDiffOptions` are exported from `src/index.ts`
- [x] `pixelmatch` is listed as optional peer dependency
- [x] All new code has tests, target 80%+ coverage on new files
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes

### Phase 2 (AI Diff) — Follow-up

- [x] `compare(a, b, { diffImage: { method: 'ai' } })` with Google provider returns AI-annotated diff image
- [x] `method: 'ai'` with Anthropic/OpenAI throws `VisualAIConfigError`
- [x] AI diff runs sequentially (after AI comparison), not in parallel

## File Change Summary

| File                                                               | Action  | Description                                                                            |
| ------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------- |
| [src/types.ts](src/types.ts)                                       | Edit    | Add `DiffImageOptions`, `DiffImageResult`, update `CompareOptions` and `CompareResult` |
| [src/core/diff.ts](src/core/diff.ts)                               | **New** | `generatePixelDiff()`, validation, dimension matching                                  |
| [src/core/client.ts](src/core/client.ts)                           | Edit    | Wire diff generation into `compare()` with parallel execution                          |
| [src/format.ts](src/format.ts)                                     | Edit    | Add diff summary line to `formatCompareResult`                                         |
| [src/index.ts](src/index.ts)                                       | Edit    | Export new types                                                                       |
| [package.json](package.json)                                       | Edit    | Add `pixelmatch` as optional peer dep                                                  |
| [tests/core/diff.test.ts](tests/core/diff.test.ts)                 | **New** | Unit tests for diff generation                                                         |
| [tests/core/client.test.ts](tests/core/client.test.ts)             | Edit    | Integration tests for compare + diff                                                   |
| [tests/fixtures/diff-base.png](tests/fixtures/diff-base.png)       | **New** | Test fixture                                                                           |
| [tests/fixtures/diff-changed.png](tests/fixtures/diff-changed.png) | **New** | Test fixture                                                                           |

## References

- [pixelmatch](https://github.com/mapbox/pixelmatch) — Pixel-level image comparison library
- [sharp](https://sharp.pixelplumbing.com/) — Image processing (already a dependency)
- [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation) — For Phase 2 AI diff
- Institutional learning: [base64 detection order](docs/solutions/logic-errors/base64-misidentified-as-file-path.md) — relevant for any new image input handling
