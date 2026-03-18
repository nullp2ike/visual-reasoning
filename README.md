# visual-ai-assertions

AI-powered visual assertions for E2E tests. Send screenshots to Claude, GPT, or Gemini and get structured, typed results.

## Installation

```bash
# Install the library (includes OpenAI SDK by default)
npm install visual-ai-assertions

# Optional: install additional provider SDKs
npm install @anthropic-ai/sdk    # for Claude
npm install @google/genai        # for Gemini

# Zod is a peer dependency
npm install zod
```

### System Requirements

This library uses [sharp](https://sharp.pixelplumbing.com/) for image processing.
Sharp downloads native binaries automatically for most supported platforms.

If installation fails in CI, Docker, or a minimal Linux image:

- See the [sharp installation guide](https://sharp.pixelplumbing.com/install)
- On Alpine Linux, install `vips-dev` with `apk add --no-cache vips-dev`
- On minimal Docker images, use `--platform=linux/amd64` or install the required build tools

## Quick Start

### Playwright + Anthropic

```typescript
import { test, expect } from "@playwright/test";
import { visualAI } from "visual-ai-assertions";

const ai = visualAI();
// Provider auto-inferred from ANTHROPIC_API_KEY env var

test("login page looks correct", async ({ page }) => {
  await page.goto("https://myapp.com/login");
  const screenshot = await page.screenshot();

  const result = await ai.check(screenshot, [
    "A login form is visible with email and password fields",
    "A 'Sign In' button is present and visually enabled",
    "The company logo appears in the header",
    "No error messages are displayed",
  ]);

  // Simple pass/fail
  expect(result.pass).toBe(true);

  // Or inspect individual statements
  for (const stmt of result.statements) {
    expect(stmt.pass, `Failed: ${stmt.statement} — ${stmt.reasoning}`).toBe(true);
  }
});
```

### WebDriverIO + OpenAI

```typescript
import { visualAI } from "visual-ai-assertions";

const ai = visualAI({ model: "gpt-5-mini" });
// Provider inferred from model prefix

describe("Product Page", () => {
  it("should display all required elements", async () => {
    await browser.url("https://myapp.com/products/1");
    const screenshot = await browser.saveScreenshot("./screenshot.png");

    const result = await ai.elementsVisible(screenshot, [
      "Product title",
      "Price tag",
      "Add to Cart button",
      "Product image",
    ]);

    expect(result.pass).toBe(true);
  });
});
```

## API Reference

### `visualAI(config?)`

Create an AI visual analysis instance. Provider is auto-inferred from the model name or API key environment variable.

```typescript
import { visualAI, Provider, Model } from "visual-ai-assertions";

// Minimal — provider inferred from ANTHROPIC_API_KEY env var
const ai = visualAI();

// Explicit configuration
const ai = visualAI({
  model: "claude-sonnet-4-6", // optional, sensible defaults per provider
  apiKey: "sk-...", // optional, defaults to provider env var
  debug: true, // optional, logs prompts/responses to stderr
  maxTokens: 4096, // optional, default 4096
  reasoningEffort: "high", // optional, "low" | "medium" | "high" | "xhigh"
  trackUsage: false, // optional, defaults to false — usage stats to stderr
});

// Use constants for IDE autocomplete
const ai = visualAI({
  model: Model.Anthropic.SONNET_4_6,
});
```

### `ai.check(image, statements, options?)`

Visual assertion. Returns `pass: true` only if ALL statements are true.

```typescript
// Single statement
const result = await ai.check(screenshot, "The login button is visible");

// Multiple statements
const result = await ai.check(screenshot, [
  "The login button is visible",
  "No error messages are displayed",
]);

// With instructions
const result = await ai.check(screenshot, ["The form is submitted"], {
  instructions: ["Ignore loading spinners that appear briefly"],
});
```

**Returns:** `CheckResult`

```typescript
{
  pass: boolean;             // true only if ALL statements pass
  reasoning: string;         // overall summary
  issues: Issue[];           // structured findings
  statements: StatementResult[]; // per-statement breakdown
  usage?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost?: number;    // USD
    durationSeconds?: number;  // API call duration
  };
}
```

### `ai.ask(image, prompt, options?)`

Free-form analysis. Returns structured issues with priority and category.

```typescript
const result = await ai.ask(screenshot, "Analyze this page for UI issues");

// Filter by priority
const critical = result.issues.filter((i) => i.priority === "critical");

// With instructions
const result = await ai.ask(screenshot, "Check for accessibility issues", {
  instructions: ["Ignore contrast on decorative elements"],
});
```

**Returns:** `AskResult`

```typescript
{
  summary: string;           // high-level analysis
  issues: Issue[];           // categorized findings
  usage?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost?: number;
    durationSeconds?: number;
  };
}
```

### `ai.compare(imageA, imageB, options?)`

Compare two images and get structured differences.

```typescript
import { writeFileSync } from "node:fs";

// Basic comparison
const result = await ai.compare(before, after);

// gemini-3-flash-preview includes an annotated diff by default.
// Pass { diffImage: false } to opt out.

// With custom prompt and instructions
const result = await ai.compare(before, after, {
  prompt: "Focus on header layout changes",
  instructions: ["Ignore date/time differences"],
});

// With AI-generated diff image (supported only by gemini-3-flash-preview)
const result = await ai.compare(before, after, {
  diffImage: true,
});
if (result.diffImage) {
  writeFileSync("diff.png", result.diffImage.data);
}
```

**Returns:** `CompareResult`

```typescript
{
  pass: boolean;               // true if no critical/major changes
  reasoning: string;           // overall summary
  changes: ChangeEntry[];      // list of visual differences
  diffImage?: {                // present when diffing is enabled explicitly or by Gemini 3 preview defaults
    data: Buffer;              // PNG image data
    width: number;
    height: number;
    mimeType: "image/png";
  };
  usage?: UsageInfo;
}
```

Where `ChangeEntry` is:

```typescript
{
  description: string; // what changed
  severity: "critical" | "major" | "minor";
}
```

### Template Methods

Type-safe methods for common visual QA checks. All return `CheckResult`. Use `Accessibility`, `Layout`, and `Content` constants for IDE autocomplete.

```typescript
import { Accessibility, Layout, Content } from "visual-ai-assertions";

// Check that UI elements are visible
await ai.elementsVisible(screenshot, ["Submit button", "Nav bar", "Footer"]);

// Check that UI elements are hidden
await ai.elementsHidden(screenshot, ["Loading spinner", "Error modal"]);

// Accessibility checks (contrast, readability, interactive visibility)
await ai.accessibility(screenshot);
await ai.accessibility(screenshot, {
  checks: [Accessibility.CONTRAST, Accessibility.READABILITY],
});

// Layout checks (overlap, overflow, alignment)
await ai.layout(screenshot);
await ai.layout(screenshot, {
  checks: [Layout.OVERLAP, Layout.OVERFLOW],
  instructions: ["Sticky headers may overlap content — ignore if < 10px"],
});

// Page load verification
await ai.pageLoad(screenshot);
await ai.pageLoad(screenshot, { expectLoaded: false }); // expect loading state

// Content checks (placeholder text, errors, broken images)
await ai.content(screenshot);
await ai.content(screenshot, {
  checks: [Content.PLACEHOLDER_TEXT, Content.ERROR_MESSAGES],
});
```

### Issue Structure

Every issue includes:

```typescript
{
  priority: "critical" | "major" | "minor";
  category: "accessibility" |
    "missing-element" |
    "layout" |
    "content" |
    "styling" |
    "functionality" |
    "performance" |
    "other";
  description: string; // what the issue is
  suggestion: string; // how to fix it
}
```

### Image Input

Accepts multiple formats:

```typescript
// Buffer (from Playwright screenshot)
const screenshot = await page.screenshot();
await ai.check(screenshot, "...");

// File path
await ai.check("./screenshots/page.png", "...");

// Base64 string
await ai.check(base64String, "...");

// URL
await ai.check("https://example.com/screenshot.png", "...");
```

Oversized images are automatically resized to provider limits.

### Formatting & Assertion Helpers

```typescript
import {
  formatCheckResult,
  formatCompareResult,
  assertVisualResult,
  assertVisualCompareResult,
} from "visual-ai-assertions";

// Pretty-print results to console
const result = await ai.check(screenshot, ["Login form is visible"]);
console.log(formatCheckResult(result, "login-page"));

// Throw VisualAIAssertionError on failure (includes full result on error)
assertVisualResult(result, "login-page");

// Same for compare results
const diff = await ai.compare(before, after);
console.log(formatCompareResult(diff));
assertVisualCompareResult(diff, "regression-check");
```

## Error Handling

All errors extend `VisualAIError`, and every concrete error includes an `error.code` string for programmatic handling:

```typescript
import { isVisualAIKnownError } from "visual-ai-assertions";

try {
  const result = await ai.check(screenshot, "Page is loaded");
} catch (error) {
  if (isVisualAIKnownError(error)) {
    switch (error.code) {
      case "AUTH_FAILED":
        // Invalid or missing API key
        break;
      case "RATE_LIMITED":
        // Rate limited — error.retryAfter has seconds to wait
        break;
      case "IMAGE_INVALID":
        // Invalid image: corrupt, unsupported format, etc.
        break;
      case "RESPONSE_PARSE_FAILED":
        // AI returned unparseable response — error.rawResponse has raw text
        break;
      case "CONFIG_INVALID":
        // Provider SDK not installed or invalid config
        break;
      case "ASSERTION_FAILED":
        // assertVisualResult threw — error.result has the full failed result
        break;
      case "PROVIDER_ERROR":
      case "VISUAL_AI_ERROR":
        break;
    }
  }
}
```

The `VisualAIKnownError` union and `isVisualAIKnownError()` helper are useful when you want `switch (error.code)` to narrow to subclass-specific fields such as `retryAfter`, `statusCode`, or `rawResponse`. Class-based `instanceof` checks continue to work too.

## Environment Variables

### API Keys

| Provider  | Environment Variable |
| --------- | -------------------- |
| Anthropic | `ANTHROPIC_API_KEY`  |
| OpenAI    | `OPENAI_API_KEY`     |
| Google    | `GOOGLE_API_KEY`     |

### Optional Configuration

| Variable                | Description                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `VISUAL_AI_MODEL`       | Default model when `model` is not set in config. Overrides the provider's default model.       |
| `VISUAL_AI_DEBUG`       | Enable debug logging when `debug` is not set in config. Use `"true"` or `"1"` to enable.       |
| `VISUAL_AI_TRACK_USAGE` | Enable usage tracking when `trackUsage` is not set in config. Use `"true"` or `"1"` to enable. |

## Configuration

| Option            | Type    | Default          | Description                                                                   |
| ----------------- | ------- | ---------------- | ----------------------------------------------------------------------------- |
| `apiKey`          | string  | env var          | API key for the provider                                                      |
| `model`           | string  | provider default | Model to use                                                                  |
| `debug`           | boolean | `false`          | Log prompts/responses to stderr                                               |
| `maxTokens`       | number  | `4096`           | Max tokens for AI response                                                    |
| `reasoningEffort` | string  | `undefined`      | `"low"` `"medium"` `"high"` `"xhigh"` — controls how deeply the model reasons |
| `trackUsage`      | boolean | `false`          | Log token usage and estimated cost to stderr                                  |

## Exported Types

```typescript
import type {
  AskResult,
  CheckResult,
  CompareResult,
  SupportedMimeType,
  VisualAIConfig,
  VisualAIErrorCode,
} from "visual-ai-assertions";
```

`SupportedMimeType` is the exported image MIME union:

```typescript
type SupportedMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
```

**Default models:**

| Provider  | Default Model            |
| --------- | ------------------------ |
| Anthropic | `claude-sonnet-4-6`      |
| OpenAI    | `gpt-5-mini`             |
| Google    | `gemini-3-flash-preview` |

## Reasoning Effort

Control how deeply the model reasons before responding. Higher effort produces more thorough analysis but uses more tokens and takes longer.

```typescript
const ai = visualAI({
  reasoningEffort: "high", // "low" | "medium" | "high" | "xhigh"
});
```

When omitted, each provider uses its default behavior. The `"xhigh"` level enables maximum reasoning depth (maps to Anthropic's `"max"` effort and OpenAI's `"xhigh"` via the Responses API).

| Provider  | Native Parameter                                      | `"xhigh"` maps to    |
| --------- | ----------------------------------------------------- | -------------------- |
| Anthropic | `thinking.type: "adaptive"` + `output_config.effort`  | `effort: "max"`      |
| OpenAI    | `reasoning.effort` (Responses API)                    | `effort: "xhigh"`    |
| Google    | `thinkingConfig.thinkingBudget` (1024 / 8192 / 24576) | `24576` (max budget) |

## Supported Models

All listed models support image/vision input. Pass any model ID to the `model` config option.

### Anthropic

| Model             | Model ID            | Input $/MTok | Output $/MTok | Notes                         |
| ----------------- | ------------------- | ------------ | ------------- | ----------------------------- |
| Claude Opus 4.6   | `claude-opus-4-6`   | $5           | $25           | Most capable, 128K max output |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | $3           | $15           | **Default** — best value      |
| Claude Haiku 4.5  | `claude-haiku-4-5`  | $1           | $5            | Fastest, budget-friendly      |

### OpenAI

| Model       | Model ID      | Input $/MTok | Output $/MTok | Notes                          |
| ----------- | ------------- | ------------ | ------------- | ------------------------------ |
| GPT-5.4 Pro | `gpt-5.4-pro` | $30          | $180          | Most capable, extended context |
| GPT-5.4     | `gpt-5.4`     | $2.50        | $15           | Best vision quality            |
| GPT-5.2     | `gpt-5.2`     | $1.75        | $14           | Balanced quality and cost      |
| GPT-5 mini  | `gpt-5-mini`  | $0.25        | $2            | **Default** — fast and cheap   |

### Google

| Model          | Model ID                 | Input $/MTok | Output $/MTok | Notes                             |
| -------------- | ------------------------ | ------------ | ------------- | --------------------------------- |
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | $2           | $12           | Preview — most advanced reasoning |
| Gemini 3 Flash | `gemini-3-flash-preview` | $0.50        | $3            | **Default** — fast and capable    |

## License

MIT
