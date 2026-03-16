---
title: "feat: Build visual-ai-assertions TypeScript library"
type: feat
status: completed
date: 2026-02-16
brainstorm: docs/brainstorms/2026-02-16-visual-reasoning-library-brainstorm.md
---

# feat: Build visual-ai-assertions TypeScript library

## Overview

Build `visual-ai-assertions`, a TypeScript library that sends screenshots to AI vision models (Claude, GPT, Gemini) and returns structured results with categorized issues. Users add it to Playwright or WebDriverIO projects and call functions like `check(image, "Is the login button visible?")` to get `{ pass: true, reasoning: "...",  issues: [] }`, or `query(image, "Analyze this page")` to get prioritized issues with categories and improvement suggestions.

This plan covers the full greenfield setup: project scaffolding, CLAUDE.md, core architecture, provider drivers, template prompts, and CI.

## Problem Statement

QA engineers and developers writing E2E tests lack a simple way to add AI-powered visual assertions. Current options require building custom integrations with each AI provider's SDK, handling image normalization, parsing unstructured AI responses, and managing provider differences. This library abstracts all of that behind a clean, typed API.

## Technical Approach

### Architecture

**Unified Core + Provider Drivers** (decided in brainstorm):

```
src/
  index.ts                    # Public API exports
  types.ts                    # Shared types and Zod schemas
  errors.ts                   # Typed error classes
  core/
    image.ts                  # Image normalization (Buffer, path, base64, URL → provider format)
    prompt.ts                 # Prompt construction (wraps user prompt with JSON-output instructions)
    response.ts               # Response parsing + Zod validation
    client.ts                 # Client class that wires provider + core together
  providers/
    types.ts                  # Provider interface definition
    anthropic.ts              # Anthropic driver (@anthropic-ai/sdk)
    openai.ts                 # OpenAI driver (openai)
    google.ts                 # Google driver (@google/genai)
  templates/
    index.ts                  # Template registry and execution
    missing-elements.ts       # Check for missing UI elements
    accessibility.ts          # Basic accessibility checks
    layout.ts                 # Layout and overflow checks
    page-load.ts              # Page load verification
    content.ts                # Placeholder/error text detection
```

### Public API Design

```typescript
// Configuration
import { createClient } from "visual-ai-assertions";

const client = createClient({
  provider: "anthropic", // "anthropic" | "openai" | "google"
  model: "claude-sonnet-4-5-20250929", // optional, sensible defaults per provider
  apiKey: process.env.ANTHROPIC_API_KEY, // optional, falls back to env vars
});

// Free-form query — returns structured issues with priority, category, and suggestions
const result = await client.query(screenshot, "Analyze this page for any visual issues");
// → {
//   summary: "Page has 3 issues: a critical accessibility problem, ...",
//   issues: [
//     { priority: "critical", category: "accessibility", description: "Submit button has insufficient color contrast (2.1:1)", suggestion: "Increase contrast ratio to at least 4.5:1 per WCAG AA" },
//     { priority: "major",    category: "layout",        description: "Footer overlaps main content on scroll", suggestion: "Add margin-bottom to main content or use sticky positioning" },
//     { priority: "minor",    category: "content",       description: "Placeholder text 'Lorem ipsum' visible in sidebar", suggestion: "Replace with actual content or remove section" },
//   ]
// }

// Visual assertion — single statement
const result = await client.check(screenshot, "The login button is visible and not obscured");
// → { pass: true, reasoning: "...",  issues: [], statements: [
//     { statement: "The login button is visible and not obscured", pass: true, reasoning: "Login button is clearly visible in the center of the form" }
//   ]}

// Visual assertion — multiple statements (pass = true only if ALL statements pass)
const result = await client.check(screenshot, [
  "The login button is visible and not obscured",
  "The email input field has a placeholder text",
  "The page header contains the company logo",
  "No error messages are displayed",
]);
// → {
//   pass: false,                    // false because not all statements passed
//   reasoning: "3 of 4 checks passed. The email input field lacks placeholder text.",
//   //   issues: [
//     { priority: "major", category: "missing-element", description: "Email input has no placeholder text", suggestion: "Add placeholder='Enter your email' to the input element" }
//   ],
//   statements: [
//     { statement: "The login button is visible and not obscured", pass: true, reasoning: "Button is visible at the center of the form" },
//     { statement: "The email input field has a placeholder text", pass: false, reasoning: "Input field is empty with no visible placeholder" },
//     { statement: "The page header contains the company logo", pass: true, reasoning: "Logo image is present in the top-left header area" },
//     { statement: "No error messages are displayed", pass: true, reasoning: "No error messages or warning banners visible" },
//   ]
// }

// Image comparison — structured diff with categorized changes
const result = await client.compare(before, after, "Describe visual differences");
// → { pass: false, reasoning: "...",  issues: [
//     { priority: "major", category: "missing-element", description: "Navigation bar is missing in the after image", suggestion: "Verify nav component is rendered" }
//   ]}

// Template methods — type-safe DSL with autocomplete, no magic strings
const result = await client.missingElements(screenshot, [
  "Submit button",
  "Navigation bar",
  "Footer",
]);
// → { pass: false, reasoning: "...", issues: [...], statements: [...] }

const result = await client.accessibility(screenshot);
// → { pass: false, reasoning: "...", issues: [
//     { priority: "critical", category: "accessibility", description: "...", suggestion: "..." }
//   ], statements: [...] }

const result = await client.layout(screenshot);
const result = await client.pageLoad(screenshot);
const result = await client.content(screenshot, { checks: ["placeholder-text", "error-messages"] });
```

### Key Design Decisions (from SpecFlow analysis)

| Decision              | Choice                                                                                                                  | Rationale                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Response coercion     | Provider-specific structured output (OpenAI JSON mode, Anthropic tool_use) + Zod validation                             | Most reliable; prompt-only JSON is fragile                                                             |
| Provider SDKs         | Optional peer dependencies with runtime detection                                                                       | Keeps bundle small; clear error if SDK missing                                                         |
| Image auto-resize     | Yes, to provider max dimensions                                                                                         | Playwright retina screenshots routinely exceed limits                                                  |
| Error classes         | Typed: `VisualAIError` base + `AuthError`, `RateLimitError`, `ProviderError`, `ImageError`, `ResponseParseError`        | Users need typed errors to implement their own retry                                                   |
| Confidence field      | Removed — not included                                                                                                  | AI self-reported confidence is poorly calibrated, varies across providers, and creates false precision |
| `query` vs `check`    | `query` returns `{ summary, issues[] }` for analysis; `check` returns `{ pass, issues[], statements[] }` for assertions | Query finds issues; check passes/fails with per-statement detail                                       |
| Multi-statement check | `check()` accepts `string \| string[]`; `pass` = true only if ALL statements pass                                       | One API call evaluates multiple conditions; per-statement breakdown aids debugging                     |
| Issue structure       | Each issue has `priority` (critical/major/minor), `category`, `description`, `suggestion`                               | Actionable, filterable, reportable findings                                                            |
| Template API          | First-class methods on client (`client.missingElements()`, `client.accessibility()`, etc.)                              | Type-safe DSL with autocomplete — no magic strings, discoverable API                                   |
| Template parameters   | Each method has its own typed signature                                                                                 | `missingElements(img, elements[])`, `accessibility(img)`, `content(img, { checks })`                   |
| Token usage           | Included in response as optional `usage: { inputTokens, outputTokens }`                                                 | Cost visibility for CI suites                                                                          |
| Debug mode            | `debug: true` config option, logs to stderr                                                                             | Essential for prompt/response debugging                                                                |
| API key source        | Explicit config > env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`)                                    | Convention over configuration                                                                          |
| Default models        | Anthropic: `claude-sonnet-4-5-20250929`, OpenAI: `gpt-4.1-mini`, Google: `gemini-2.5-flash`                             | Balance cost and quality for test assertions                                                           |

### Response Types

```typescript
// src/types.ts

// --- Shared types ---

type IssuePriority = "critical" | "major" | "minor";

type IssueCategory =
  | "accessibility"
  | "missing-element"
  | "layout"
  | "content"
  | "styling"
  | "functionality"
  | "performance"
  | "other";

interface Issue {
  priority: IssuePriority; // critical, major, or minor
  category: IssueCategory; // what kind of issue
  description: string; // what the issue is
  suggestion: string; // how to fix/improve it
}

// --- Per-statement result (for check) ---

interface StatementResult {
  statement: string; // the original statement text
  pass: boolean; // whether this specific statement is true
  reasoning: string; // explanation for this statement's result
}

// --- check() and compare() and template() result ---

interface CheckResult {
  pass: boolean; // true only if ALL statements pass
  reasoning: string; // overall summary

  issues: Issue[]; // structured list of findings
  statements: StatementResult[]; // per-statement breakdown
  usage?: { inputTokens: number; outputTokens: number };
}

// check() accepts: string | string[] — single statement or array of statements
// When a single string is passed, statements[] has one entry
// pass = true only when every statement passes

// --- query() result: free-form image analysis with structured issues ---

interface QueryResult {
  summary: string; // high-level analysis summary
  issues: Issue[]; // each finding with priority, category, and suggestion
  usage?: { inputTokens: number; outputTokens: number };
}

// CheckResult is also used for compare() and template()

type ImageInput = Buffer | Uint8Array | string;
// string is interpreted as: file path (if starts with / or ./ or contains path separators),
// URL (if starts with http:// or https://), or base64 (otherwise)
```

### Provider SDK Differences (from research)

| Aspect            | Anthropic                               | OpenAI                                | Google                                |
| ----------------- | --------------------------------------- | ------------------------------------- | ------------------------------------- |
| Base64 format     | Raw base64, separate `media_type` field | `data:image/...;base64,...` data URL  | Raw base64, separate `mimeType` field |
| URL support       | `source: { type: "url", url }`          | `image_url: { url }`                  | Fetch + inline only                   |
| Response text     | `message.content[0].text`               | `response.choices[0].message.content` | `response.text`                       |
| Structured output | Tool use                                | JSON mode (`response_format`)         | JSON mode                             |
| Max image size    | 5 MB / 8000x8000 px                     | 50 MB total payload                   | 20 MB total inline                    |
| Optimal size      | 1568 px long edge                       | `detail: "auto"` handles it           | Auto                                  |

### Error Hierarchy

```typescript
// src/errors.ts

class VisualAIError extends Error {}
class VisualAIAuthError extends VisualAIError {}
class VisualAIRateLimitError extends VisualAIError {
  retryAfter?: number; // seconds, when provider reports it
}
class VisualAIProviderError extends VisualAIError {
  statusCode?: number;
}
class VisualAIImageError extends VisualAIError {}
class VisualAIResponseParseError extends VisualAIError {
  rawResponse: string; // the unparseable model output
}
class VisualAIConfigError extends VisualAIError {}
```

## Implementation Phases

### Phase 1: Project Scaffolding + CLAUDE.md

Set up the entire project infrastructure so all subsequent development has a proper feedback loop.

**Tasks:**

- [x] Create `.gitignore` (node_modules, dist, coverage, .env, \*.tgz)
- [x] Install pnpm if not present (`corepack enable && corepack prepare pnpm@latest --activate`)
- [x] Initialize `package.json` with pnpm (`pnpm init`)
- [x] Configure `package.json` fields: name, type, exports, files, engines, packageManager, scripts, peerDependencies
- [x] Create `tsconfig.json` with strict mode, NodeNext module, ES2022 target
- [x] Create `tsup.config.ts` for dual ESM+CJS build with dts
- [x] Create `vitest.config.ts` with Node environment, coverage thresholds (80%), test directory
- [x] Create `eslint.config.mjs` with flat config, strictTypeChecked, Prettier integration
- [x] Create `.prettierrc`
- [x] Set up Husky + lint-staged for pre-commit hooks (lint + format)
- [x] Create `src/index.ts` stub
- [x] Create `CLAUDE.md` with development guidelines
- [x] Create `.github/workflows/ci.yml` for lint, typecheck, test, build across Node 18/20/22

**CLAUDE.md content:**

```markdown
# visual-ai-assertions

TypeScript library for AI-powered visual assertions in E2E tests.

## Commands

- `pnpm test` — Run tests (Vitest)
- `pnpm test:ci` — Run tests with coverage
- `pnpm lint` — Lint with ESLint
- `pnpm format` — Format with Prettier
- `pnpm typecheck` — Type check with tsc --noEmit
- `pnpm build` — Build with tsup (ESM + CJS + .d.ts)

## Before every commit

Run all checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

## Development rules

- **Test first**: Write tests before implementation. Target 80%+ coverage.
- **Strict TypeScript**: No `any`. Use `unknown` + type narrowing. Enable all strict checks.
- **Zod for AI responses**: All AI model responses must be validated with Zod schemas before returning to users.
- **No barrel re-exports in subdirectories**: Only `src/index.ts` serves as the public API barrel.
- **Provider SDKs are optional peer deps**: Import them dynamically. Always check for availability at runtime with a clear error message.
- **Image handling**: Always validate image input type and format before sending to providers. Auto-resize to provider limits.
- **Errors over silent failures**: Throw typed errors (`VisualAIError` subclasses). Never swallow exceptions or return ambiguous results.
- **Keep prompts in dedicated functions**: Prompt text lives in `src/core/prompt.ts` and `src/templates/*.ts`, not inline in provider drivers.

## Project structure

- `src/core/` — Image normalization, prompt construction, response parsing, client
- `src/providers/` — Thin drivers for Anthropic, OpenAI, Google (one file each)
- `src/templates/` — Built-in prompt templates
- `src/types.ts` — Shared types and Zod schemas
- `src/errors.ts` — Typed error classes
- `tests/` — Mirrors src/ structure

## Naming conventions

- Files: kebab-case (`missing-elements.ts`)
- Types/interfaces: PascalCase (`CheckResult`, `ProviderDriver`)
- Functions: camelCase (`createClient`, `normalizeImage`)
- Constants: UPPER_SNAKE_CASE (`DEFAULT_MAX_TOKENS`)
- Test files: `*.test.ts` in `tests/` directory
```

**Success criteria:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass on the stub project.

#### Phase 2: Types, Errors, and Image Handling

Build the foundational types and the image normalization layer — the most error-prone piece.

**Tasks:**

- [x] Define all public types in `src/types.ts` with Zod schemas:
  - `IssuePrioritySchema`, `IssueCategorySchema`, `IssueSchema` (Zod) — shared issue structure
  - `StatementResultSchema` (Zod) — per-statement pass/fail with reasoning
  - `CheckResultSchema`, `QueryResultSchema` (Zod) — CheckResult includes `statements[]`, both reference `IssueSchema`
  - `CheckResult`, `QueryResult`, `Issue`, `IssuePriority`, `IssueCategory`, `StatementResult` (inferred from Zod)
  - `ImageInput` type
  - `ClientConfig` interface
  - `ProviderName` union type
  - Template option types: `AccessibilityOptions`, `LayoutOptions`, `PageLoadOptions`, `ContentOptions`
- [x] Implement typed error classes in `src/errors.ts`
- [x] Implement `src/core/image.ts`:
  - `normalizeImage(input: ImageInput)` → `{ data: Buffer, mimeType: string }`
  - Detect input type: Buffer/Uint8Array → use directly; string → detect file path vs URL vs base64
  - File path: read file, detect mime type from extension
  - URL: fetch image with timeout (10s), validate content-type
  - Base64: decode and validate
  - Validate supported formats (JPEG, PNG, WebP, GIF)
  - Auto-resize if dimensions exceed provider limits (use sharp or canvas)
  - Throw `VisualAIImageError` for invalid/corrupt/unsupported inputs
- [x] Implement `src/providers/types.ts`:
  - `ProviderDriver` interface: `sendMessage(image: NormalizedImage, prompt: string): Promise<RawProviderResponse>`
  - `NormalizedImage` type (provider-specific format produced by each driver)
  - `RawProviderResponse` type

**Tests (write first):**

- [x] `tests/types.test.ts` — Zod schema validation (valid and invalid payloads)
- [x] `tests/errors.test.ts` — Error class hierarchy, instanceof checks, property access
- [x] `tests/core/image.test.ts` — All 4 input types, invalid inputs, format detection, resize behavior
  - Use fixture images in `tests/fixtures/` (small PNG, JPEG, WebP, GIF, corrupt file, oversized image)

**Success criteria:** All image input types normalize correctly; invalid inputs throw `VisualAIImageError`; Zod schemas accept valid and reject invalid results.

### Phase 3: Provider Drivers

Implement the three provider drivers. Each is a thin adapter that takes a normalized image + prompt and returns the raw model response.

**Tasks:**

- [x] Implement `src/providers/anthropic.ts`:
  - Dynamic import of `@anthropic-ai/sdk`; throw `VisualAIConfigError` if not installed
  - Format image as `{ type: "image", source: { type: "base64", media_type, data } }`
  - Use tool_use for structured JSON output (define a tool schema matching `CheckResult`)
  - Map Anthropic errors to `VisualAIAuthError`, `VisualAIRateLimitError`, `VisualAIProviderError`
  - Extract `usage.input_tokens` and `usage.output_tokens`
- [x] Implement `src/providers/openai.ts`:
  - Dynamic import of `openai`; throw `VisualAIConfigError` if not installed
  - Format image as `{ type: "image_url", image_url: { url: "data:image/...;base64,..." } }`
  - Use `response_format: { type: "json_object" }` for structured output
  - Map OpenAI errors to typed errors
  - Extract `usage.prompt_tokens` and `usage.completion_tokens`
- [x] Implement `src/providers/google.ts`:
  - Dynamic import of `@google/genai`; throw `VisualAIConfigError` if not installed
  - Format image as `{ inlineData: { mimeType, data } }`
  - Use JSON mode in generation config for structured output
  - Map Google errors to typed errors
  - Extract usage from response metadata

**Tests (write first, mock SDKs):**

- [x] `tests/providers/anthropic.test.ts` — Mock `@anthropic-ai/sdk`, test message formatting, error mapping, structured output parsing
- [x] `tests/providers/openai.test.ts` — Mock `openai`, test data URL formatting, JSON mode, error mapping
- [x] `tests/providers/google.test.ts` — Mock `@google/genai`, test inline data formatting, error mapping
- [x] `tests/providers/missing-sdk.test.ts` — Test that each driver throws `VisualAIConfigError` when its SDK is not installed

**Success criteria:** Each driver correctly formats images per provider spec; structured output is requested; errors are typed; missing SDK throws clear error.

### Phase 4: Core Engine (Prompt + Response + Client)

Wire everything together: prompt construction, response parsing, and the public client API.

**Tasks:**

- [x] Implement `src/core/prompt.ts`:
  - `buildCheckPrompt(statements: string | string[])` → wraps statement(s) with instructions to evaluate each independently and return JSON matching `CheckResult` schema (overall pass + per-statement results + issues)
  - `buildQueryPrompt(userPrompt: string)` → wraps user prompt with instructions to return JSON matching `QueryResult` schema (summary + issues with priority/category/suggestion)
  - `buildComparePrompt(userPrompt: string)` → wraps with comparison-specific instructions, returns `CheckResult` with issues describing differences
  - Check prompts instruct model to evaluate each statement independently and return per-statement pass/fail
  - Prompts instruct model to classify each finding as `critical`/`major`/`minor` priority and assign an `IssueCategory`
  - Prompts instruct model to provide an actionable `suggestion` for each issue
  - Include few-shot examples in prompts for consistent output (especially the Issue structure)
- [x] Implement `src/core/response.ts`:
  - `parseCheckResponse(raw: string): CheckResult` — Parse JSON, validate with Zod, throw `VisualAIResponseParseError` on failure
  - `parseQueryResponse(raw: string): QueryResult` — Same for query results
  - Include `rawResponse` in parse errors for debugging
- [x] Implement `src/core/client.ts`:
  - `createClient(config: ClientConfig)` → returns client object with `query`, `check`, `compare`, `template` methods
  - Resolve provider from config (validate provider name, detect API key from config or env)
  - Lazy-instantiate provider driver on first call
  - `check(image, statements: string | string[])`: normalize image → build check prompt for all statements → send via driver → parse response (pass = all statements true)
  - `query(image, prompt)`: normalize image → build query prompt → send via driver → parse response
  - `compare(imageA, imageB, prompt)`: normalize both → build compare prompt → send via driver → parse response
  - Template methods on client: `missingElements()`, `accessibility()`, `layout()`, `pageLoad()`, `content()`
  - Each method delegates to its template's prompt builder → sends via driver → parses response
  - Debug logging when `debug: true` (prompt sent, response received, timing)
- [x] Export public API from `src/index.ts`:
  - `createClient` function
  - All types: `CheckResult`, `QueryResult`, `Issue`, `IssuePriority`, `IssueCategory`, `StatementResult`, `ClientConfig`, `ImageInput`, `ProviderName`
  - Template option types: `AccessibilityOptions`, `LayoutOptions`, `PageLoadOptions`, `ContentOptions`
  - All error classes

**Tests (write first):**

- [x] `tests/core/prompt.test.ts` — Verify prompts include JSON instructions, check vs query vs compare differences
- [x] `tests/core/response.test.ts` — Valid JSON, malformed JSON, missing fields, extra fields, Zod validation
- [x] `tests/core/client.test.ts` — Full flow with mocked provider: config → check → result; config errors; debug logging
- [x] `tests/index.test.ts` — Verify all expected exports exist

**Success criteria:** `createClient` → `check()` returns a valid `CheckResult` with mocked provider (single and multi-statement); `query()` returns `QueryResult` with prioritized issues; `compare()` works with two images; invalid responses throw `VisualAIResponseParseError`.

### Phase 5: Template Prompts

Implement built-in template prompts for common visual QA checks.

**Tasks:**

- [x] Implement template prompt builders in `src/templates/`:
  - Each template exports a `buildPrompt(options)` function that returns the prompt string
  - Templates are wired to client methods in `src/core/client.ts`
- [x] Implement `src/templates/missing-elements.ts`:
  - Client method: `client.missingElements(image, elements: string[])`
  - Prompt: asks model to verify each listed element is visible, returns per-element statement results
  - Generates one statement per element for the `statements[]` array
- [x] Implement `src/templates/accessibility.ts`:
  - Client method: `client.accessibility(image, options?: { checks?: ("contrast" | "readability" | "interactive-visibility")[] })`
  - Defaults to all checks if no options provided
  - Prompt: asks model to evaluate visual accessibility aspects
- [x] Implement `src/templates/layout.ts`:
  - Client method: `client.layout(image, options?: { checks?: ("overlap" | "overflow" | "alignment")[] })`
  - Defaults to all checks if no options provided
  - Prompt: asks model to check for layout issues
- [x] Implement `src/templates/page-load.ts`:
  - Client method: `client.pageLoad(image, options?: { expectLoaded?: boolean })`
  - Default: `expectLoaded: true`
  - Prompt: asks model if page appears fully loaded (no spinners, skeleton screens, blank areas)
- [x] Implement `src/templates/content.ts`:
  - Client method: `client.content(image, options?: { checks?: ("placeholder-text" | "error-messages" | "broken-images")[] })`
  - Defaults to all checks if no options provided
  - Prompt: asks model to detect placeholder text, visible errors, or broken images

**Tests (write first):**

- [x] `tests/templates/missing-elements.test.ts` — Prompt includes element names; handles empty list
- [x] `tests/templates/accessibility.test.ts` — Default checks vs selective; prompt content
- [x] `tests/templates/layout.test.ts` — All check types; prompt content
- [x] `tests/templates/page-load.test.ts` — Loaded vs not-loaded expectation
- [x] `tests/templates/content.test.ts` — Each check type; prompt content
- [x] `tests/core/client-templates.test.ts` — All template methods exist on client; type signatures are correct; delegation to prompt builders works

**Success criteria:** Each template method generates a focused prompt; all methods have typed signatures with autocomplete; `client.missingElements(img, [...])` returns structured `CheckResult` with per-element statements.

### Phase 6: Integration Tests and Documentation

End-to-end tests with real (or well-mocked) provider flows, plus README and usage docs.

**Tasks:**

- [x] Create `tests/integration/` with full-flow tests per provider (using SDK mocks that simulate realistic responses)
- [x] Test the complete flow: `createClient` → `check/query/compare/template` → validate result shape
- [x] Test error flows: auth failure, rate limit, malformed model response, corrupt image
- [x] Test image auto-resize flow
- [x] Write `README.md` based on the Consumer Usage Guide section in this plan:
  - Installation (library + provider SDK + zod)
  - Quick start: Playwright + Anthropic example
  - Quick start: WebDriverIO + OpenAI example
  - API reference: `createClient`, `check`, `query`, `compare`, and all template methods
  - Configuration options table
  - Error handling with typed errors
  - Environment variables table
  - Provider comparison (supported models, image limits)
- [x] Validate package with `pnpm dlx @arethetypeswrong/cli --pack .`
- [x] Run full CI pipeline: `pnpm typecheck && pnpm lint && pnpm test:ci && pnpm build`

**Success criteria:** All integration tests pass; README covers all public APIs; `attw` reports no type resolution issues; CI passes across Node 18/20/22.

## Consumer Usage Guide

This section documents how end users consume `visual-ai-assertions` in their projects. This content will form the basis of the README.

### Installation

```bash
# Install the library
npm install visual-ai-assertions

# Install your preferred provider SDK (pick one or more)
npm install @anthropic-ai/sdk    # for Claude
npm install openai               # for GPT
npm install @google/genai        # for Gemini

# Zod is a peer dependency
npm install zod
```

### Playwright Example

```typescript
// tests/visual-checks.spec.ts
import { test, expect } from "@playwright/test";
import { createClient } from "visual-ai-assertions";

const ai = createClient({
  provider: "anthropic",
  // apiKey defaults to ANTHROPIC_API_KEY env var
});

test("login page looks correct", async ({ page }) => {
  await page.goto("https://myapp.com/login");
  const screenshot = await page.screenshot();

  // Multi-statement assertion — pass only if ALL statements are true
  const result = await ai.check(screenshot, [
    "A login form is visible with email and password fields",
    "A 'Sign In' button is present and visually enabled",
    "The company logo appears in the header",
    "No error messages are displayed",
  ]);

  // Simple pass/fail assertion
  expect(result.pass).toBe(true);

  // Or inspect individual statements for better test reporting
  for (const stmt of result.statements) {
    expect(stmt.pass, `Failed: ${stmt.statement} — ${stmt.reasoning}`).toBe(true);
  }
});

test("dashboard has no accessibility issues", async ({ page }) => {
  await page.goto("https://myapp.com/dashboard");
  const screenshot = await page.screenshot();

  const result = await ai.accessibility(screenshot);
  expect(result.pass).toBe(true);

  // Or fail only on critical issues
  const criticalIssues = result.issues.filter((i) => i.priority === "critical");
  expect(criticalIssues).toHaveLength(0);
});

test("no layout issues on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("https://myapp.com");
  const screenshot = await page.screenshot();

  const result = await ai.layout(screenshot, { checks: ["overlap", "overflow"] });
  expect(result.pass).toBe(true);
});
```

### WebDriverIO Example

```typescript
// tests/visual-checks.test.ts
import { createClient } from "visual-ai-assertions";

const ai = createClient({
  provider: "openai",
  model: "gpt-4.1-mini",
  // apiKey defaults to OPENAI_API_KEY env var
});

describe("Product Page", () => {
  it("should display all required elements", async () => {
    await browser.url("https://myapp.com/products/1");

    // WebDriverIO returns base64 screenshot
    const screenshot = await browser.saveScreenshot("./screenshot.png");

    const result = await ai.missingElements(screenshot, [
      "Product title",
      "Price tag",
      "Add to Cart button",
      "Product image",
      "Customer reviews section",
    ]);

    expect(result.pass).toBe(true);
  });

  it("should show visual differences after theme change", async () => {
    await browser.url("https://myapp.com/products/1");
    const before = await browser.saveScreenshot("./before.png");

    await $(".theme-toggle").click();
    const after = await browser.saveScreenshot("./after.png");

    const result = await ai.compare(before, after, "Describe layout and color changes");

    // Inspect categorized issues
    for (const issue of result.issues) {
      console.log(`[${issue.priority}] ${issue.category}: ${issue.description}`);
      console.log(`  Suggestion: ${issue.suggestion}`);
    }
  });
});
```

### Free-form Query for Page Analysis

```typescript
// Use query() when you want a comprehensive analysis, not a pass/fail assertion
const result = await ai.query(screenshot, "Analyze this page for any UI issues");

// result.summary — "Found 3 issues: 1 critical, 1 major, 1 minor..."
// result.issues — structured list with priority, category, description, suggestion

// Filter by priority
const critical = result.issues.filter((i) => i.priority === "critical");
const major = result.issues.filter((i) => i.priority === "major");

// Filter by category
const a11y = result.issues.filter((i) => i.category === "accessibility");
```

### Configuration Options

```typescript
const client = createClient({
  // Required
  provider: "anthropic" | "openai" | "google",

  // Optional — defaults to provider-specific env var
  apiKey: "sk-...",

  // Optional — sensible defaults per provider
  model: "claude-sonnet-4-5-20250929",

  // Optional — log prompts and responses to stderr
  debug: true,

  // Optional — max tokens for AI response (default: 4096)
  maxTokens: 4096,
});
```

### Error Handling

```typescript
import {
  createClient,
  VisualAIAuthError,
  VisualAIRateLimitError,
  VisualAIImageError,
  VisualAIResponseParseError,
  VisualAIConfigError,
} from "visual-ai-assertions";

try {
  const result = await ai.check(screenshot, "Page is loaded");
} catch (error) {
  if (error instanceof VisualAIAuthError) {
    // Invalid or missing API key
  } else if (error instanceof VisualAIRateLimitError) {
    // Rate limited — error.retryAfter has seconds to wait (if reported by provider)
  } else if (error instanceof VisualAIImageError) {
    // Invalid image: corrupt file, unsupported format, etc.
  } else if (error instanceof VisualAIResponseParseError) {
    // AI returned unparseable response — error.rawResponse has the raw text
  } else if (error instanceof VisualAIConfigError) {
    // Provider SDK not installed or invalid config
  }
}
```

### Environment Variables

The library automatically reads API keys from environment variables:

| Provider  | Environment Variable |
| --------- | -------------------- |
| Anthropic | `ANTHROPIC_API_KEY`  |
| OpenAI    | `OPENAI_API_KEY`     |
| Google    | `GOOGLE_API_KEY`     |

Set these in your `.env` file or CI environment — no need to pass them explicitly.

## Alternative Approaches Considered

| Approach                                             | Why rejected                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Vercel AI SDK as unified layer                       | Less control over provider-specific features (tool_use, JSON mode); extra dependency |
| Framework-specific matchers (Jest/Playwright expect) | Couples library to specific frameworks; own API is more portable                     |
| Plugin architecture                                  | Over-engineered for 3 providers; added complexity without proportional value         |
| Custom template registration                         | YAGNI — free-form prompts cover custom needs; simpler API surface                    |
| Built-in retry logic                                 | Adds complexity; users know their rate limits and retry strategies better            |

## Acceptance Criteria

### Functional Requirements

- [x] `createClient()` initializes with any of the three providers
- [x] `check()` accepts `string | string[]` and returns `{ pass, reasoning, issues[], statements[] }` validated by Zod
- [x] `check()` with multiple statements returns `pass: false` if any statement fails, with per-statement breakdown in `statements[]`
- [x] Each issue has `{ priority, category, description, suggestion }`; each statement result has `{ statement, pass, reasoning }`
- [x] `query()` returns `{ summary, issues[] }` validated by Zod, with each issue categorized by priority (critical/major/minor) and category
- [x] `compare()` accepts two images and returns structured comparison
- [x] All 5 template methods work as first-class client methods: `client.missingElements()`, `client.accessibility()`, `client.layout()`, `client.pageLoad()`, `client.content()`
- [x] All 4 image input types (Buffer, file path, base64, URL) are handled correctly
- [x] Oversized images are auto-resized to provider limits
- [x] Missing provider SDK throws `VisualAIConfigError` with install instructions
- [x] Provider errors are mapped to typed `VisualAIError` subclasses
- [x] Malformed AI responses throw `VisualAIResponseParseError` with raw response

### Non-Functional Requirements

- [x] Strict TypeScript — zero `any` types in source code
- [x] Test coverage >= 80% lines, branches, functions
- [x] Package builds as both ESM and CJS with correct type exports
- [x] `@arethetypeswrong/cli` reports no issues
- [x] CI passes on Node 18, 20, and 22
- [x] No bundled provider SDKs — all optional peer dependencies
- [x] Package size < 50 KB (excluding peer deps)

### Quality Gates

- [x] All Vitest tests pass
- [x] ESLint reports zero errors
- [x] TypeScript reports zero type errors
- [x] Pre-commit hooks enforce lint + format

## Dependencies and Prerequisites

| Dependency              | Type          | Purpose                            |
| ----------------------- | ------------- | ---------------------------------- |
| `zod`                   | peer          | Runtime validation of AI responses |
| `@anthropic-ai/sdk`     | optional peer | Anthropic provider driver          |
| `openai`                | optional peer | OpenAI provider driver             |
| `@google/genai`         | optional peer | Google provider driver             |
| `sharp`                 | dependency    | Image resize (lightweight, native) |
| `tsup`                  | dev           | Build tool                         |
| `typescript`            | dev           | Compiler                           |
| `vitest`                | dev           | Test runner                        |
| `eslint` + plugins      | dev           | Linting                            |
| `prettier`              | dev           | Formatting                         |
| `husky` + `lint-staged` | dev           | Pre-commit hooks                   |

## Risk Analysis and Mitigation

| Risk                                                         | Likelihood | Impact | Mitigation                                                                               |
| ------------------------------------------------------------ | ---------- | ------ | ---------------------------------------------------------------------------------------- |
| AI models return inconsistent JSON despite structured output | Medium     | High   | Zod validation catches it; `VisualAIResponseParseError` with raw response aids debugging |
| Provider SDK breaking changes                                | Medium     | Medium | Pin peer dependency version ranges; test against latest in CI                            |
| `sharp` native dependency causes install issues              | Low        | Medium | Consider fallback to pure-JS resize or make resize optional                              |
| Users hit rate limits in CI with many visual assertions      | Medium     | Medium | Document batching strategies; include `retryAfter` in rate limit errors                  |

## References and Research

### Internal References

- Brainstorm: `docs/brainstorms/2026-02-16-visual-reasoning-library-brainstorm.md`

### Provider Documentation

- Anthropic Vision API: https://docs.anthropic.com/en/docs/build-with-claude/vision
- OpenAI Vision Guide: https://platform.openai.com/docs/guides/vision
- Google Gemini Image Understanding: https://ai.google.dev/gemini-api/docs/image-understanding

### Tooling Documentation

- tsup: https://tsup.egoist.dev/
- Vitest: https://vitest.dev/
- typescript-eslint: https://typescript-eslint.io/
- Husky: https://typicode.github.io/husky/
- Are The Types Wrong: https://arethetypeswrong.github.io/
