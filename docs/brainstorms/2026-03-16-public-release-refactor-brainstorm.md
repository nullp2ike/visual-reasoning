# Public Release Refactor

**Date:** 2026-03-16
**Status:** Brainstorm complete

## What We're Building

A comprehensive refactoring of visual-ai-assertions before its public release, covering API naming, architecture, developer experience, and documentation. Since there are no external consumers yet, we can make breaking changes freely.

## Why This Approach

The library is solid internally (94.85% test coverage, strict TypeScript, clean error hierarchy), but several aspects need polish for public consumption: inconsistent naming, tight coupling between core and provider modules, zero JSDoc on public APIs, and README errors. Addressing these now avoids painful breaking changes after users adopt the library.

We'll execute in **4 phased PRs** in dependency order so each is independently reviewable and testable.

## Key Decisions

### API Naming

| Current                                               | New                              | Rationale                                                       |
| ----------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| `query()`                                             | `ask()`                          | More intuitive for "ask a question about the image"             |
| `edgeCaseRules` option                                | `rules`                          | The option accepts any supplementary rules, not just edge cases |
| Separate `Accessibility`, `Layout`, `Content` exports | Keep flat (no `Check` namespace) | Simpler, update README to match actual exports                  |

### Architecture

- **Provider registry pattern**: Replace the switch-case in `createDriver()` with a registry so adding a provider only requires one file + registration. Currently requires touching 4-5 files.
- **Config objects for driver constructors**: Replace positional args `(apiKey, model, maxTokens, reasoningEffort)` with a config object for extensibility.
- **Extract config resolution from client.ts**: Move env var parsing, config merging, and provider auto-detection into a dedicated module. Client.ts is currently 373 lines mixing config, logging, timing, and 8 API methods.
- **Extract debug logging**: Move debug/timing logic out of client.ts into its own module.
- **Fix core→provider coupling**: `src/core/diff.ts` imports `needsCodeExecution` from `src/providers/google.ts`. Move the prompt-selection logic into `GoogleDriver.generateImage()` so core has no knowledge of specific providers.

### Developer Experience

- **JSDoc on all public APIs**: `visualAI()`, `check()`, `ask()`, `compare()`, `elementsVisible()`, `elementsHidden()`, `accessibility()`, `layout()`, `pageLoad()`, `content()`, `formatCheckResult()`, `assertVisualResult()`, all exported types and Zod schemas.
- **Error codes**: Add a `code` property to all `VisualAIError` subclasses (e.g. `AUTH_FAILED`, `RATE_LIMITED`, `PARSE_FAILED`, `INVALID_IMAGE`, `PROVIDER_ERROR`, `INVALID_CONFIG`, `ASSERTION_FAILED`).
- **Tighter types**: Change `NormalizedImage.mimeType` from `string` to `"image/jpeg" | "image/png" | "image/webp" | "image/gif"`.
- **Shared constants**: Extract `maxTokens` default (4096) hardcoded in 3 provider files into a single `DEFAULT_MAX_TOKENS` constant.

### Docs & Packaging

- **Fix README errors**: Remove `Check` namespace references, fix `trackUsage` default (says `true`, actually `false`).
- **Add `repository`, `homepage`, `bugs` to package.json**.
- **Add CHANGELOG.md** for the public release.
- **Document `sharp` requirement** clearly in README (native dependency, may need platform-specific install in Docker/CI).
- **Improve test coverage on `src/core/image.ts`** (currently 77.48% — URL fetch, data URL, and error branches uncovered).

### Kept As-Is

- **`sharp` stays as a required dependency** — image resizing is core functionality.
- **`check()` method name** — generic but pairs well with `ask()`.
- **Error class hierarchy** — well-designed, just adding codes on top.
- **Template structure** — `src/templates/` barrel is internal-only, acceptable.

## Execution Plan

### PR 1: API Naming Changes

- Rename `query()` → `ask()` (method, types, tests, docs)
- Rename `edgeCaseRules` → `rules` (option, types, tests, docs)
- Update README to remove `Check` namespace, use flat exports
- Fix `trackUsage` default documentation

### PR 2: Architecture Restructure

- Introduce provider registry pattern
- Refactor driver constructors to accept config objects
- Extract config resolution into `src/core/config.ts`
- Extract debug/timing logic into `src/core/debug.ts`
- Move `needsCodeExecution` logic into `GoogleDriver.generateImage()`
- Extract `DEFAULT_MAX_TOKENS` into shared constant

### PR 3: Developer Experience

- Add JSDoc to all public API functions, types, and schemas
- Add `code` property to all error classes
- Tighten `NormalizedImage.mimeType` to literal union
- Improve test coverage on `src/core/image.ts`

### PR 4: Docs & Packaging

- Add `repository`, `homepage`, `bugs` to package.json
- Create CHANGELOG.md
- Document `sharp` installation requirements
- Final README review and polish

## Open Questions

None — all decisions resolved during brainstorming.
