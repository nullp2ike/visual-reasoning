---
title: "refactor: Public release preparation"
type: refactor
status: active
date: 2026-03-16
---

# refactor: Public Release Preparation

## Overview

Comprehensive refactoring of visual-ai-assertions before public release, executed across 4 sequential PRs: API naming, architecture restructure, developer experience, and docs/packaging. Pre-1.0 with no external consumers — clean breaking changes.

Brainstorm: [docs/brainstorms/2026-03-16-public-release-refactor-brainstorm.md](../brainstorms/2026-03-16-public-release-refactor-brainstorm.md)

## Problem Statement

The library is internally solid (94.85% coverage, strict TS, clean error hierarchy) but has gaps for public consumption:

- Confusing names (`query()`, `edgeCaseRules`) and README referencing nonexistent `Check` namespace
- Core module imports from a specific provider (`diff.ts` → `google.ts`)
- Zero JSDoc on public APIs; no error codes for programmatic handling
- README errors; missing package.json metadata for npm

## Proposed Solution

4 phased PRs in strict dependency order. Each PR must pass `pnpm typecheck && pnpm lint && pnpm test && pnpm build` before the next begins.

---

## Phase 1: API Naming Changes

**Branch:** `refactor/api-naming`

### 1.1 Rename `query()` → `ask()` (full scope)

Rename the method **and** all associated types, schemas, functions, and labels throughout:

| Location                                                               | Current                                                                                             | New                                                       |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [src/core/client.ts:43](../../src/core/client.ts#L43)                  | `query(image, prompt): Promise<QueryResult>` (interface)                                            | `ask(image, prompt, options?): Promise<AskResult>`        |
| [src/core/client.ts:259-268](../../src/core/client.ts#L259-L268)       | `query()` implementation + debug labels `"query prompt"`, `"query response"`, usage label `"query"` | `ask()` + `"ask prompt"`, `"ask response"`, `"ask"`       |
| [src/types.ts:85-92](../../src/types.ts#L85-L92)                       | `QueryResultSchema`, `QueryResult` type, comment `// --- query() result ---`                        | `AskResultSchema`, `AskResult`, `// --- ask() result ---` |
| [src/core/prompt.ts:48](../../src/core/prompt.ts#L48)                  | `QUERY_OUTPUT_SCHEMA`                                                                               | `ASK_OUTPUT_SCHEMA`                                       |
| [src/core/prompt.ts:91](../../src/core/prompt.ts#L91)                  | `DEFAULT_QUERY_ROLE`                                                                                | `DEFAULT_ASK_ROLE`                                        |
| [src/core/prompt.ts:136](../../src/core/prompt.ts#L136)                | `buildQueryPrompt(userPrompt)`                                                                      | `buildAskPrompt(userPrompt)`                              |
| [src/core/response.ts:3-4,13,42-44](../../src/core/response.ts#L3-L44) | `QueryResponseSchema`, `parseQueryResponse()`                                                       | `AskResponseSchema`, `parseAskResponse()`                 |
| [src/index.ts:30,55](../../src/index.ts#L30)                           | `QueryResult` type export, `QueryResultSchema` schema export                                        | `AskResult`, `AskResultSchema`                            |
| [README.md:144-168](../../README.md#L144-L168)                         | `ai.query(...)` section, `QueryResult` block                                                        | `ai.ask(...)`, `AskResult`                                |

**Test files to update:**

| File                                                                                       | Changes                                                                      |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [tests/core/client.test.ts:453+](../../tests/core/client.test.ts#L453)                     | `describe("query()")` → `describe("ask()")`, `ai.query(...)` → `ai.ask(...)` |
| [tests/core/response.test.ts:110+](../../tests/core/response.test.ts#L110)                 | `parseQueryResponse` → `parseAskResponse`                                    |
| [tests/core/prompt.test.ts:78+](../../tests/core/prompt.test.ts#L78)                       | `buildQueryPrompt` → `buildAskPrompt`                                        |
| [tests/types.test.ts:333+](../../tests/types.test.ts#L333)                                 | `QueryResultSchema` → `AskResultSchema`                                      |
| [tests/integration/full-flow.test.ts:136+](../../tests/integration/full-flow.test.ts#L136) | `query()` → `ask()` calls                                                    |
| [tests/index.test.ts:14](../../tests/index.test.ts#L14)                                    | `QueryResultSchema` → `AskResultSchema` export check                         |
| tests/smoke/\*.smoke.test.ts                                                               | `ai.query(...)` → `ai.ask(...)`, `QueryResult` → `AskResult`                 |

### 1.2 Add `rules` option to `ask()` for API parity

Currently `query()` takes only `(image, prompt)` — no options. The existing docs flagged this as a parity gap. Since we're renaming anyway, add optional `AskOptions` with `rules`:

```typescript
// src/types.ts — new
export interface AskOptions {
  readonly rules?: readonly string[];
}

// src/core/client.ts — updated signature
ask(image: ImageInput, prompt: string, options?: AskOptions): Promise<AskResult>
```

Wire `options.rules` through to `buildAskPrompt()` using the same `buildRulesSection()` pattern as `check()`.

### 1.3 Rename `edgeCaseRules` → `rules` (full depth)

Rename through the entire stack — public types, internal types, helper functions, and constants:

**Public types** ([src/types.ts](../../src/types.ts)):

| Line | Current                                   | New                               |
| ---- | ----------------------------------------- | --------------------------------- |
| 121  | `CheckOptions.edgeCaseRules`              | `CheckOptions.rules`              |
| 139  | `CompareOptions.edgeCaseRules`            | `CompareOptions.rules`            |
| 144  | `ElementsVisibilityOptions.edgeCaseRules` | `ElementsVisibilityOptions.rules` |
| 149  | `AccessibilityOptions.edgeCaseRules`      | `AccessibilityOptions.rules`      |
| 154  | `LayoutOptions.edgeCaseRules`             | `LayoutOptions.rules`             |
| 159  | `PageLoadOptions.edgeCaseRules`           | `PageLoadOptions.rules`           |
| 164  | `ContentOptions.edgeCaseRules`            | `ContentOptions.rules`            |

**Internal types and functions** ([src/core/prompt.ts](../../src/core/prompt.ts)):

| Line    | Current                                               | New                          |
| ------- | ----------------------------------------------------- | ---------------------------- |
| 105     | `CheckPromptOptions.edgeCaseRules`                    | `CheckPromptOptions.rules`   |
| 110     | `ComparePromptOptions.edgeCaseRules`                  | `ComparePromptOptions.rules` |
| 113     | `buildEdgeRulesSection()`                             | `buildRulesSection()`        |
| 114     | Prompt text: `"Rules for handling edge cases:"`       | `"Additional rules:"`        |
| 126-127 | `options.edgeCaseRules` usage in `buildCheckPrompt`   | `options.rules`              |
| 166-167 | `options.edgeCaseRules` usage in `buildComparePrompt` | `options.rules`              |

**Client pass-through** ([src/core/client.ts](../../src/core/client.ts)):

| Line | Current                                 | New                     |
| ---- | --------------------------------------- | ----------------------- |
| 248  | `edgeCaseRules: options?.edgeCaseRules` | `rules: options?.rules` |
| 275  | `edgeCaseRules: options?.edgeCaseRules` | `rules: options?.rules` |

**Template files** — update property access in all 5 templates:

- [src/templates/accessibility.ts:28-34](../../src/templates/accessibility.ts#L28-L34)
- [src/templates/layout.ts:28-32](../../src/templates/layout.ts#L28-L32)
- [src/templates/elements-visibility.ts:28-34](../../src/templates/elements-visibility.ts#L28-L34)
- [src/templates/page-load.ts:22](../../src/templates/page-load.ts#L22)
- [src/templates/content.ts:27](../../src/templates/content.ts#L27)

**Internal constants** — keep as-is. Names like `ACCESSIBILITY_EDGE_RULES`, `LAYOUT_EDGE_RULES` are internal implementation details describing _what_ the default rules handle (edge cases). Only the public-facing property name changes.

**Test files** — update `edgeCaseRules:` to `rules:` in:

- [tests/core/prompt.test.ts:60,73,138](../../tests/core/prompt.test.ts)
- [tests/templates/layout.test.ts:36](../../tests/templates/layout.test.ts#L36)
- [tests/templates/accessibility.test.ts:39](../../tests/templates/accessibility.test.ts#L39)
- [tests/templates/page-load.test.ts:28](../../tests/templates/page-load.test.ts#L28)
- [tests/templates/content.test.ts:31](../../tests/templates/content.test.ts#L31)
- [tests/templates/elements-visibility.test.ts:37,63](../../tests/templates/elements-visibility.test.ts#L37)

### 1.4 Fix README errors

- **Remove `Check` namespace** ([README.md:226-258](../../README.md#L226-L258)): Replace `import { Check }` with `import { Accessibility, Layout, Content }`, replace `Check.Accessibility.CONTRAST` with `Accessibility.CONTRAST`, etc.
- **Fix `trackUsage` default** ([README.md:97](../../README.md#L97)): Change comment from `defaults to true` to `defaults to false`

### 1.5 Add `rules` passthrough test

Currently no test verifies that `client.check()` wires `rules` through to the prompt builder. Add a test in [tests/core/client.test.ts](../../tests/core/client.test.ts) that calls `ai.check(image, statements, { rules: ["Custom rule"] })` and asserts the prompt contains `"Custom rule"`.

### Phase 1 Acceptance Criteria

- [x] All `query` references renamed to `ask` across src/, tests/, README
- [x] `AskResult` and `AskResultSchema` exported from index.ts
- [x] `ask()` accepts optional `AskOptions` with `rules`
- [x] All `edgeCaseRules` public/internal property names renamed to `rules`
- [x] Prompt section header changed to "Additional rules:"
- [x] README `Check` namespace replaced with flat imports
- [x] README `trackUsage` default corrected
- [x] New test: `rules` passthrough from client methods to prompt builder
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes

---

## Phase 2: Architecture Restructure

**Branch:** `refactor/architecture`
**Depends on:** Phase 1 merged

### 2.1 Extract config resolution into `src/core/config.ts`

Move from [src/core/client.ts:76-183](../../src/core/client.ts#L76-L183) into a new module:

```typescript
// src/core/config.ts

export interface ResolvedConfig {
  readonly provider: ProviderName;
  readonly model: string;
  readonly apiKey: string | undefined;
  readonly maxTokens: number;
  readonly reasoningEffort: ReasoningEffort | undefined;
  readonly debug: boolean;
  readonly trackUsage: boolean;
}

export function resolveConfig(config: VisualAIConfig): ResolvedConfig { ... }
```

Move these functions into the new module:

- `resolveProvider()` (currently [client.ts:93-131](../../src/core/client.ts#L93-L131))
- `parseBooleanEnv()` (currently [client.ts:133-141](../../src/core/client.ts#L133-L141))
- Model resolution, cross-validation, debug/trackUsage parsing (currently [client.ts:164-183](../../src/core/client.ts#L164-L183))

### 2.2 Extract debug/timing into `src/core/debug.ts`

Move from [src/core/client.ts:143-212](../../src/core/client.ts#L143-L212):

```typescript
// src/core/debug.ts

export function debugLog(config: ResolvedConfig, label: string, value: string): void { ... }
export function usageLog(method: string, usage: UsageInfo, config: ResolvedConfig): void { ... }
export function processUsage(method: string, rawUsage: RawUsage, config: ResolvedConfig): UsageInfo { ... }
export function timedSendMessage(driver: ProviderDriver, images: NormalizedImage[], prompt: string): Promise<TimedResponse> { ... }
```

### 2.3 Refactor driver constructors to config objects

Replace the 4 positional args with a config object:

```typescript
// src/providers/types.ts — new interface
export interface ProviderConfig {
  readonly apiKey: string | undefined;
  readonly model: string;
  readonly maxTokens: number;
  readonly reasoningEffort?: ReasoningEffort;
}
```

Update all 3 drivers:

```typescript
// Before (all 3 drivers)
constructor(apiKey: string | undefined, model?: string, maxTokens?: number, reasoningEffort?: ReasoningEffort)

// After
constructor(config: ProviderConfig)
```

Update `createDriver()` in client.ts to pass the config object.

### 2.4 Extract `DEFAULT_MAX_TOKENS` constant

Add to [src/constants.ts](../../src/constants.ts):

```typescript
export const DEFAULT_MAX_TOKENS = 4096;
```

Remove hardcoded `4096` from:

- [src/providers/anthropic.ts:33](../../src/providers/anthropic.ts#L33)
- [src/providers/openai.ts:33](../../src/providers/openai.ts#L33)
- [src/providers/google.ts:74](../../src/providers/google.ts#L74)

### 2.5 Provider registry with type safety

Replace the switch-case in `createDriver()` with a typed record:

```typescript
// src/core/client.ts (or new src/providers/registry.ts)

type ProviderFactory = (config: ProviderConfig) => ProviderDriver;

const PROVIDER_REGISTRY: Record<ProviderName, ProviderFactory> = {
  anthropic: (config) => new AnthropicDriver(config),
  openai: (config) => new OpenAIDriver(config),
  google: (config) => new GoogleDriver(config),
} as const satisfies Record<ProviderName, ProviderFactory>;

function createDriver(provider: ProviderName, config: ProviderConfig): ProviderDriver {
  return PROVIDER_REGISTRY[provider](config);
}
```

**Key design choice:** Use `Record<ProviderName, ProviderFactory>` (not a `Map`) to preserve TypeScript exhaustiveness checking. If a new provider is added to the `ProviderName` union, the record will produce a compile-time error until its factory is registered.

> **Note:** For 3 providers, this is a mild improvement over the switch-case. The real value is establishing the pattern for future extensibility. If this feels over-engineered during implementation, the switch-case is acceptable too — the config object refactor (2.3) is the higher-value change.

### 2.6 Fix core→provider coupling in diff.ts

Move `needsCodeExecution` logic into `GoogleDriver.generateImage()`:

**Current** ([src/core/diff.ts:5](../../src/core/diff.ts#L5)):

```typescript
import { needsCodeExecution } from "../providers/google.js";
// diff.ts uses needsCodeExecution to decide which prompt to send
```

**After:**

- `GoogleDriver.generateImage()` internally checks `needsCodeExecution(this.model)` and selects the appropriate prompt strategy
- `diff.ts` passes a generic prompt; the driver handles model-specific concerns
- Remove the cross-layer import

This may require extending the `generateImage` interface slightly so the driver has enough context to choose the prompt, or having `GoogleDriver.generateImage()` accept a hint parameter. The exact approach depends on reading the current diff.ts prompt logic in detail during implementation.

### Phase 2 Acceptance Criteria

- [ ] `src/core/config.ts` handles all config resolution (env vars, defaults, cross-validation)
- [ ] `src/core/debug.ts` handles debug logging, usage tracking, and timing
- [ ] `client.ts` is significantly shorter — only method orchestration
- [ ] All 3 drivers accept `ProviderConfig` object, no positional args
- [ ] `DEFAULT_MAX_TOKENS` constant used everywhere (no hardcoded 4096)
- [ ] Provider registry uses `Record<ProviderName, ProviderFactory>` with compile-time exhaustiveness
- [ ] `src/core/diff.ts` has zero imports from `src/providers/`
- [ ] All existing tests pass with updated imports
- [ ] New tests for `resolveConfig()` and `ProviderConfig` validation
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes

---

## Phase 3: Developer Experience

**Branch:** `refactor/developer-experience`
**Depends on:** Phase 2 merged

### 3.1 Add error codes with literal types

Add a `code` property to every error class using `readonly` literal types for discriminated union support:

```typescript
// src/errors.ts

export class VisualAIError extends Error {
  readonly code: string; // base type for catch-all handling
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class VisualAIAuthError extends VisualAIError {
  declare readonly code: "AUTH_FAILED";
  constructor(message: string) {
    super(message, "AUTH_FAILED");
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

Error code mapping:

| Class                        | Code                      |
| ---------------------------- | ------------------------- |
| `VisualAIAuthError`          | `"AUTH_FAILED"`           |
| `VisualAIRateLimitError`     | `"RATE_LIMITED"`          |
| `VisualAIProviderError`      | `"PROVIDER_ERROR"`        |
| `VisualAIImageError`         | `"IMAGE_INVALID"`         |
| `VisualAIResponseParseError` | `"RESPONSE_PARSE_FAILED"` |
| `VisualAIConfigError`        | `"CONFIG_INVALID"`        |
| `VisualAIAssertionError`     | `"ASSERTION_FAILED"`      |

Export the error code type union from [src/index.ts](../../src/index.ts):

```typescript
export type VisualAIErrorCode =
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "IMAGE_INVALID"
  | "RESPONSE_PARSE_FAILED"
  | "CONFIG_INVALID"
  | "ASSERTION_FAILED";
```

**Tests:** Update [tests/errors.test.ts](../../tests/errors.test.ts) — add assertions for `error.code` value on every subclass. Add a test that demonstrates switching on `error.code`:

```typescript
try { ... } catch (e) {
  if (e instanceof VisualAIError) {
    switch (e.code) {
      case "RATE_LIMITED": // handle
      case "AUTH_FAILED": // handle
    }
  }
}
```

### 3.2 Tighten `NormalizedImage.mimeType` to literal union

Define a new type and apply it throughout:

```typescript
// src/types.ts
export type SupportedMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

// Update NormalizedImage
export interface NormalizedImage {
  readonly data: Buffer;
  readonly mimeType: SupportedMimeType;
  readonly base64: string;
}
```

**Downstream updates:**

- [src/core/image.ts](../../src/core/image.ts): Update `detectMimeType()` and `getMimeFromExtension()` return types to `SupportedMimeType | null`. These functions already return the correct string literals, just needs a type annotation update.
- [src/providers/anthropic.ts:70](../../src/providers/anthropic.ts#L70): Remove the `as "image/jpeg" | ...` cast — no longer needed since the type is already narrow.
- Export `SupportedMimeType` from [src/index.ts](../../src/index.ts).

### 3.3 Add JSDoc to all public APIs

Add JSDoc with `@param`, `@returns`, `@throws`, and `@example` tags to all public exports. Priority order:

**Tier 1 — Functions (most impactful for IDE experience):**

- `visualAI()` in [src/core/client.ts](../../src/core/client.ts) — include example with Playwright
- All `VisualAIClient` interface methods: `check`, `ask`, `compare`, `elementsVisible`, `elementsHidden`, `accessibility`, `layout`, `pageLoad`, `content`
- `formatCheckResult()`, `formatCompareResult()`, `assertVisualResult()`, `assertVisualCompareResult()` in [src/format.ts](../../src/format.ts)

**Tier 2 — Types and interfaces:**

- `VisualAIConfig`, `VisualAIClient` in [src/core/client.ts](../../src/core/client.ts)
- `CheckResult`, `AskResult`, `CompareResult`, `CheckOptions`, `CompareOptions`, `AskOptions`, all template options in [src/types.ts](../../src/types.ts)
- `ImageInput`, `ProviderName`, `ReasoningEffort` in [src/types.ts](../../src/types.ts)

**Tier 3 — Error classes:**

- Each error class in [src/errors.ts](../../src/errors.ts) — document what triggers it and what extra fields it carries

**Tier 4 — Zod schemas and constants:**

- Brief descriptions on each exported schema
- `Provider`, `Model`, `Content`, `Layout`, `Accessibility` constants

### 3.4 Improve test coverage on `src/core/image.ts`

Target: **90%+ line coverage** (currently 77.48%).

Add tests in [tests/core/image.test.ts](../../tests/core/image.test.ts) for these uncovered paths:

| Gap                          | image.ts Lines | Test Description                                                   |
| ---------------------------- | -------------- | ------------------------------------------------------------------ |
| URL fetch success            | 127-152        | Mock `fetch` to return image buffer, verify normalization          |
| URL fetch timeout            | 131            | Mock `fetch` to hang, verify timeout error                         |
| URL fetch non-200            | 139-142        | Mock 404 response, verify `VisualAIImageError`                     |
| URL content-type fallback    | 148-149        | Mock response with wrong content-type, verify magic byte detection |
| Unrecognized string input    | 205-208        | Pass random string, verify `VisualAIImageError`                    |
| Non-Buffer/string/Uint8Array | 211-213        | Pass `number`, verify `VisualAIImageError`                         |
| Empty base64 decode          | 175-177        | Pass valid base64 that decodes to empty, verify error              |
| Relative file paths          | `isFilePath()` | Pass `./image.png`, `../image.png`, verify correct handling        |

### Phase 3 Acceptance Criteria

- [ ] All 7 error subclasses have `readonly code` with literal types
- [ ] `VisualAIErrorCode` union type exported
- [ ] `SupportedMimeType` type defined and used in `NormalizedImage`
- [ ] `as` cast removed from Anthropic driver
- [ ] JSDoc on all public functions, interface methods, types, and error classes
- [ ] `src/core/image.ts` test coverage ≥ 90%
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes

---

## Phase 4: Docs & Packaging

**Branch:** `refactor/docs-packaging`
**Depends on:** Phase 3 merged

### 4.1 Package.json metadata

Add to [package.json](../../package.json):

```json
{
  "author": "<user's name/handle>",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/<user>/<repo>.git"
  },
  "homepage": "https://github.com/<user>/<repo>#readme",
  "bugs": {
    "url": "https://github.com/<user>/<repo>/issues"
  },
  "sideEffects": false
}
```

### 4.2 Create CHANGELOG.md

Create initial CHANGELOG following [Keep a Changelog](https://keepachangelog.com/) format. Document the cumulative breaking changes from all 4 PRs:

```markdown
# Changelog

## [0.2.0] - 2026-03-XX

### Breaking Changes

- Renamed `query()` to `ask()`, `QueryResult` to `AskResult`, `QueryResultSchema` to `AskResultSchema`
- Renamed `edgeCaseRules` option to `rules` across all methods
- `NormalizedImage.mimeType` narrowed from `string` to `SupportedMimeType` literal union

### Added

- `ask()` now accepts optional `AskOptions` with `rules` for supplementary instructions
- Error codes on all error classes (`error.code`) for programmatic handling
- `VisualAIErrorCode` and `SupportedMimeType` type exports
- JSDoc documentation on all public APIs
- `sideEffects: false` for tree-shaking support

### Changed

- Provider drivers now accept config objects instead of positional arguments (internal)
- Config resolution extracted to dedicated module (internal)
- Debug/timing logic extracted to dedicated module (internal)
- Provider creation uses typed registry pattern (internal)

### Fixed

- README template examples now use correct flat imports (`Accessibility`, `Layout`, `Content`) instead of nonexistent `Check` namespace
- README `trackUsage` default corrected from `true` to `false`
```

### 4.3 Document sharp requirements

Add a section to README after Installation:

```markdown
### System Requirements

This library uses [sharp](https://sharp.pixelplumbing.com/) for image processing.
Sharp includes native binaries that are automatically downloaded for most platforms.

If you encounter installation issues (e.g., in Docker or CI):

- See [sharp installation docs](https://sharp.pixelplumbing.com/install)
- For Alpine Linux: `apk add --no-cache vips-dev`
- For minimal Docker images: use `--platform=linux/amd64` or install build tools
```

### 4.4 Final README review

Full pass through README to ensure:

- All code examples use new names (`ask()`, `rules`, `AskResult`, flat imports)
- All method signatures match actual implementation
- Configuration table is accurate
- Error handling section mentions `error.code`
- Add `SupportedMimeType` to types documentation

### 4.5 Validate package types

Run `@arethetypeswrong/cli` to validate exported types:

```bash
npx @arethetypeswrong/cli --pack .
```

This catches mismatched ESM/CJS type declarations — a common issue for dual-format packages. (From institutional learning: [typescript-library-build-configuration](../solutions/build-errors/typescript-library-build-configuration.md))

### Phase 4 Acceptance Criteria

- [ ] `author`, `repository`, `homepage`, `bugs`, `sideEffects` in package.json
- [ ] CHANGELOG.md created with all changes from PRs 1-4
- [ ] Sharp requirements documented in README
- [ ] README fully consistent with implementation (zero stale examples)
- [ ] `@arethetypeswrong/cli --pack .` passes clean
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes

---

## Dependencies & Risks

| Risk                                                              | Impact                           | Mitigation                                                     |
| ----------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| Large rename diff in PR 1 (~30 files)                             | Hard to review                   | Use IDE rename refactoring; verify with typecheck before tests |
| Prompt text change ("Additional rules:") could affect AI behavior | Subtle quality regression        | Run smoke tests against real providers after PR 1              |
| Provider registry losing exhaustiveness                           | Runtime errors for new providers | Use `Record<ProviderName, Factory>` not `Map`                  |
| `SupportedMimeType` union may break custom image processing code  | Compile errors for internal code | Update all internal functions that return mimeType in same PR  |
| `sharp` still a hard dep for public users                         | Installation friction            | Document clearly in PR 4; revisit if users report issues       |

## References

### Internal

- Brainstorm: [2026-03-16-public-release-refactor-brainstorm.md](../brainstorms/2026-03-16-public-release-refactor-brainstorm.md)
- Prior rename pattern: [semantic-api-rename-missingelements-to-elementsvisible-hidden.md](../solutions/logic-errors/semantic-api-rename-missingelements-to-elementsvisible-hidden.md)
- Build config learnings: [typescript-library-build-configuration.md](../solutions/build-errors/typescript-library-build-configuration.md)
- Type safety patterns: [type-safety-and-code-deduplication-review.md](../solutions/best-practices/type-safety-and-code-deduplication-review.md)
- API consistency patterns: [composable-prompt-blocks-and-api-consistency.md](../solutions/best-practices/composable-prompt-blocks-and-api-consistency.md)

### Key Files

- Entry point: [src/index.ts](../../src/index.ts)
- Client: [src/core/client.ts](../../src/core/client.ts)
- Types: [src/types.ts](../../src/types.ts)
- Errors: [src/errors.ts](../../src/errors.ts)
- Prompt builder: [src/core/prompt.ts](../../src/core/prompt.ts)
- Response parser: [src/core/response.ts](../../src/core/response.ts)
- Image normalizer: [src/core/image.ts](../../src/core/image.ts)
- Diff module: [src/core/diff.ts](../../src/core/diff.ts)
- Constants: [src/constants.ts](../../src/constants.ts)
- Providers: [src/providers/anthropic.ts](../../src/providers/anthropic.ts), [src/providers/openai.ts](../../src/providers/openai.ts), [src/providers/google.ts](../../src/providers/google.ts)
