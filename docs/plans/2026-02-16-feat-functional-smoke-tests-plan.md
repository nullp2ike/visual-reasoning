---
title: "feat: Add functional smoke tests with real API keys"
type: feat
status: completed
date: 2026-02-16
---

# Add Functional Smoke Tests with Real API Keys

## Overview

Create a suite of functional smoke tests that call real Anthropic, OpenAI, and Google AI APIs against a real e-commerce mobile app screenshot. These tests validate the full round-trip for every client method, verify Zod schema compliance on real responses, confirm cost tracking works, and include both positive and negative assertions.

Currently all 144 tests mock provider SDKs. These smoke tests fill the gap — they are the first tests to hit live APIs.

## Problem Statement

The library has zero tests that validate real API integration. Key risks are undetected:

- Provider SDK API changes (breaking changes in `@anthropic-ai/sdk`, `openai`, `@google/genai`)
- Prompt format rejected by a model
- Response format changes that break Zod parsing
- Image encoding/format issues specific to a provider
- Cost tracking returning `undefined` due to model name mismatches

## Pre-requisites: Fix Default Model Mismatch

**Bug**: `DEFAULT_MODELS` in `src/core/client.ts:56-60` lists `gpt-4o` and `gemini-2.0-flash`, but the drivers actually default to `gpt-4.1-mini` (`src/providers/openai.ts`) and `gemini-2.5-flash` (`src/providers/google.ts`). This means cost estimation uses the wrong model for users who don't explicitly set one.

**Fix before smoke tests:**

- [x] Align `DEFAULT_MODELS` in `src/core/client.ts` with actual driver defaults (`gpt-4.1-mini`, `gemini-2.5-flash`)
- [x] Add pricing entries for `openai:gpt-4.1-mini` and `google:gemini-2.5-flash` in `src/core/pricing.ts`
- [x] Update any unit tests that assert on the old default model names

## Proposed Solution

### Infrastructure

| Component     | Approach                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| Test location | `tests/smoke/` directory (3 files, one per provider)                         |
| Isolation     | Separate `vitest.config.smoke.ts` + exclude from main config                 |
| Run command   | `pnpm test:smoke`                                                            |
| Env loading   | `dotenv` dev dependency, loaded via vitest `setupFiles`                      |
| API keys      | `.env` file (already in `.gitignore`), documented in `.env.example`          |
| Test image    | `tests/smoke/fixtures/app-screenshot.png` (copied from `smoke-test-images/`) |
| Execution     | Sequential (no parallelism) to avoid rate limiting                           |
| Timeout       | 30s per test                                                                 |
| Cost guard    | Assert `usage.estimatedCost < 0.05` per call                                 |

### Test Matrix

**Anthropic** (`tests/smoke/anthropic.smoke.test.ts`) — all 8 methods + 1 negative:

| Test                      | Method                                                     | Assertion Strategy                                                                |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| check() — positive        | `check(img, "A search bar is visible")`                    | `pass === true`, schema valid, usage present                                      |
| check() — negative        | `check(img, "A login form is visible")`                    | `pass === false`, schema valid                                                    |
| check() — multi-statement | `check(img, ["search bar visible", "login form visible"])` | `statements[0].pass === true`, `statements[1].pass === false`                     |
| query()                   | `query(img, "Describe the products shown")`                | `summary` is non-empty string, mentions products/prices                           |
| compare() — same image    | `compare(img, img, "Are these identical?")`                | `pass === true`, schema valid                                                     |
| missingElements()         | `missingElements(img, ["search bar", "product prices"])`   | `pass === true`                                                                   |
| accessibility()           | `accessibility(img)`                                       | Schema valid, `reasoning` non-empty (don't assert pass — real a11y result varies) |
| layout()                  | `layout(img)`                                              | Schema valid, `reasoning` non-empty                                               |
| pageLoad()                | `pageLoad(img)`                                            | `pass === true` (page is clearly loaded)                                          |
| content()                 | `content(img)`                                             | Schema valid, `reasoning` non-empty                                               |

**OpenAI** (`tests/smoke/openai.smoke.test.ts`) — 3 core + 1 negative:

| Test                   | Method                                             | Assertion Strategy                           |
| ---------------------- | -------------------------------------------------- | -------------------------------------------- |
| check() — positive     | `check(img, "Products with prices are displayed")` | `pass === true`, schema valid, usage present |
| check() — negative     | `check(img, "A login form is visible")`            | `pass === false`                             |
| query()                | `query(img, "What type of app is this?")`          | `summary` non-empty                          |
| compare() — same image | `compare(img, img, "Are these the same?")`         | `pass === true`                              |

**Google** (`tests/smoke/google.smoke.test.ts`) — 3 core + 1 negative:

| Test                   | Method                                             | Assertion Strategy                           |
| ---------------------- | -------------------------------------------------- | -------------------------------------------- |
| check() — positive     | `check(img, "Category icons are visible")`         | `pass === true`, schema valid, usage present |
| check() — negative     | `check(img, "A login form is visible")`            | `pass === false`                             |
| query()                | `query(img, "Describe the layout of this screen")` | `summary` non-empty                          |
| compare() — same image | `compare(img, img, "Are these the same?")`         | `pass === true`                              |

**Total: 18 API calls per full run.**

### Assertion Tiers (applied to every test)

Every smoke test asserts all of these in order:

1. **Schema**: Result matches the expected Zod shape (`CheckResult` or `QueryResult`)
2. **Usage present**: `result.usage` is defined, `inputTokens > 0`, `outputTokens > 0`
3. **Cost tracked**: `result.usage.estimatedCost` is a number (not `undefined`) — validates pricing table alignment
4. **Cost guard**: `result.usage.estimatedCost < 0.05`
5. **Semantic** (where applicable): `pass === true` or `pass === false` for high-confidence assertions; non-empty `reasoning`/`summary` for all

### File Structure

```
tests/
  smoke/
    fixtures/
      app-screenshot.png          # Real e-commerce mobile app screenshot (~1.3MB)
    setup.ts                      # dotenv loading + shared helpers
    anthropic.smoke.test.ts       # 10 tests
    openai.smoke.test.ts          # 4 tests
    google.smoke.test.ts          # 4 tests
```

### Configuration Files

**`vitest.config.smoke.ts`** (new):

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/smoke/**/*.smoke.test.ts"],
    setupFiles: ["tests/smoke/setup.ts"],
    testTimeout: 30_000,
    fileParallelism: false, // run files sequentially
    sequence: { concurrent: false }, // run tests within files sequentially
  },
});
```

**`vitest.config.ts`** (modify — add exclude):

```typescript
// Add to existing test config:
exclude: ["tests/smoke/**"],
```

**`package.json`** (add script):

```json
"test:smoke": "vitest run --config vitest.config.smoke.ts"
```

**`.env.example`** (new):

```
# Required for smoke tests (pnpm test:smoke)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AI...
```

### Shared Setup (`tests/smoke/setup.ts`)

```typescript
import "dotenv/config";
```

### Test File Pattern (example: `tests/smoke/anthropic.smoke.test.ts`)

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "../../src/core/client.js";
import type { CheckResult, QueryResult } from "../../src/types.js";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const COST_LIMIT = 0.05;

let image: Buffer;

beforeAll(async () => {
  image = await readFile(join(FIXTURES_DIR, "app-screenshot.png"));
});

function assertCheckStructure(result: CheckResult): void {
  expect(result.pass).toBeTypeOf("boolean");
  expect(result.reasoning).toBeTypeOf("string");
  expect(result.reasoning.length).toBeGreaterThan(0);
  expect(Array.isArray(result.issues)).toBe(true);
  expect(Array.isArray(result.statements)).toBe(true);
}

function assertUsageTracked(result: {
  usage?: { inputTokens: number; outputTokens: number; estimatedCost?: number };
}): void {
  expect(result.usage).toBeDefined();
  expect(result.usage!.inputTokens).toBeGreaterThan(0);
  expect(result.usage!.outputTokens).toBeGreaterThan(0);
  expect(result.usage!.estimatedCost).toBeTypeOf("number");
  expect(result.usage!.estimatedCost!).toBeLessThan(COST_LIMIT);
}

describe("smoke: Anthropic provider", () => {
  const client = createClient({ provider: "anthropic", trackUsage: true });

  it("check() — positive assertion", async () => {
    /* ... */
  });
  it("check() — negative assertion", async () => {
    /* ... */
  });
  // ... etc
});
```

## Acceptance Criteria

### Infrastructure

- [x] `vitest.config.smoke.ts` created with sequential execution and 30s timeout
- [x] Main `vitest.config.ts` excludes `tests/smoke/**`
- [x] `pnpm test:smoke` script added to `package.json`
- [x] `dotenv` added as dev dependency
- [x] `tests/smoke/setup.ts` loads dotenv
- [x] `.env.example` created with placeholder API key names
- [x] Test image copied to `tests/smoke/fixtures/app-screenshot.png`

### Pre-requisite Bug Fix

- [x] `DEFAULT_MODELS` in `src/core/client.ts` aligned with driver defaults
- [x] Pricing entries added for `openai:gpt-4.1-mini` and `google:gemini-2.5-flash`
- [x] Existing unit tests updated for new default model names

### Smoke Tests

- [x] `tests/smoke/anthropic.smoke.test.ts` — 10 tests covering all 8 methods + negative + multi-statement
- [x] `tests/smoke/openai.smoke.test.ts` — 4 tests covering core methods + negative
- [x] `tests/smoke/google.smoke.test.ts` — 4 tests covering core methods + negative
- [x] Every test asserts: schema shape, usage present, cost tracked (not undefined), cost < $0.05
- [x] At least 1 negative test per provider (`pass === false` for "login form visible")
- [x] `pnpm test` still passes (smoke tests excluded)
- [x] `pnpm test:smoke` passes with valid API keys in `.env`

## Dependencies & Risks

| Risk                                 | Mitigation                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| AI non-determinism (flaky pass/fail) | Use extremely obvious assertions: clearly visible elements for `true`, clearly absent elements for `false` |
| Rate limiting (429 errors)           | Sequential execution, one file at a time                                                                   |
| Provider outages                     | These are smoke tests, not CI — manual run only. Outage = skip                                             |
| Cost accumulation                    | Per-call $0.05 guard. Estimated total per run: ~$0.05-$0.10                                                |
| Large test image in git              | 1.3MB is acceptable; `.gitattributes` can use LFS later if needed                                          |
| `compare()` needs two images         | Use same image compared to itself — validates plumbing, asserts `pass: true`                               |

## Estimated Cost Per Run

| Provider                  | Calls  | Est. Cost        |
| ------------------------- | ------ | ---------------- |
| Anthropic (Claude Sonnet) | 10     | ~$0.05-0.08      |
| OpenAI (GPT-4.1-mini)     | 4      | ~$0.003-0.01     |
| Google (Gemini 2.5 Flash) | 4      | ~$0.001-0.003    |
| **Total**                 | **18** | **~$0.05-$0.10** |

## Implementation Order

1. Fix default model mismatch bug (pre-req)
2. Install `dotenv`, create `.env.example`
3. Create `vitest.config.smoke.ts`, update main config exclude, add script
4. Create `tests/smoke/setup.ts` and `tests/smoke/fixtures/` with image
5. Write `tests/smoke/anthropic.smoke.test.ts` (largest file, establishes patterns)
6. Write `tests/smoke/openai.smoke.test.ts`
7. Write `tests/smoke/google.smoke.test.ts`
8. Run `pnpm test` to verify no regression
9. Set up `.env` with real keys and run `pnpm test:smoke`

## References

- Current integration tests (mocked): `tests/integration/full-flow.test.ts`
- Client API: `src/core/client.ts`
- Provider drivers: `src/providers/anthropic.ts`, `src/providers/openai.ts`, `src/providers/google.ts`
- Pricing table: `src/core/pricing.ts`
- Zod schemas: `src/types.ts`
- Test image: `smoke-test-images/app_screenshot.png`
