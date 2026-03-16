---
title: "TypeScript Library Build Configuration — visual-ai-assertions"
date: 2026-02-16
category: build-errors
tags:
  - typescript
  - eslint
  - image-processing
  - base64-validation
  - type-safety
  - dynamic-imports
  - sdk-integration
  - vitest
severity: medium
component: build-system, image-normalization, type-system, test-infrastructure
symptoms: |
  1. ESLint failing to lint test files — "was not found by the project service"
  2. Image normalization treating data URLs as file paths — ENOENT errors
  3. Invalid base64 strings silently producing garbage bytes — sharp throws untyped errors
  4. TypeScript TS2352 errors on dynamic SDK import type assertions
  5. ESLint reporting false positives in test files for legitimate mocking patterns
root_cause: |
  1. ESLint projectService only reads tsconfig.json which includes src/ but not tests/
  2. isFilePath() check triggers on "/" characters inside data:image/... URLs
  3. Node.js Buffer.from(str, "base64") silently accepts invalid characters
  4. TypeScript strict mode rejects direct cast from SDK module types to simplified interfaces
  5. Strict ESLint rules (no-non-null-assertion, no-unsafe-assignment) conflict with test mocking patterns
resolution: |
  1. Created tsconfig.test.json + changed ESLint to project: ["tsconfig.json", "tsconfig.test.json"]
  2. Added input.startsWith("data:") check before isFilePath() in detection chain
  3. Added regex pre-validation /^[A-Za-z0-9+/\n\r]+=*$/ before Buffer.from()
  4. Cast dynamic imports through unknown: const mod: unknown = await import(...)
  5. Added ESLint file-specific overrides for tests/**/*.ts
time_to_resolve: "~30 min per issue, staggered discovery across 6-phase build"
recurrence_risk: medium
---

# TypeScript Library Build Configuration

Challenges and solutions encountered while building `visual-ai-assertions`, a greenfield TypeScript library with strict mode, ESLint strict-type-checked, optional peer dependencies (dynamic imports), and image processing via sharp.

## Challenge 1: ESLint projectService Not Finding Test Files

**Symptom:** ESLint reports `Parsing error: tests/index.test.ts was not found by the project service`.

**Root Cause:** The main `tsconfig.json` only includes `src/`. ESLint's `projectService` (or `project` option) uses this to determine which files to lint with type information. Test files in `tests/` fall outside its scope.

**Solution:**

1. Create `tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "include": ["src", "tests"],
  "compilerOptions": {
    "rootDir": ".",
    "noUnusedLocals": false,
    "noUnusedParameters": false
  }
}
```

2. Update ESLint config to reference both configs:

```javascript
// eslint.config.mjs
{
  languageOptions: {
    parserOptions: {
      project: ["tsconfig.json", "tsconfig.test.json"],
      tsconfigRootDir: import.meta.dirname,
    },
  },
}
```

**Why it works:** By listing both configs in the `project` array, ESLint can resolve source files via `tsconfig.json` and test files via `tsconfig.test.json`. The test config extends the base so compiler options stay consistent.

---

## Challenge 2: Data URLs Misidentified as File Paths

**Symptom:** `normalizeImage("data:image/png;base64,iVBOR...")` throws `ENOENT: no such file or directory`.

**Root Cause:** The `isFilePath()` function checks for `/` characters. Data URLs like `data:image/png;base64,...` contain `/` in the MIME type, triggering the file path detection before the base64 path.

**Solution:** Check for `data:` prefix before checking for file paths:

```typescript
// Order matters: most specific → least specific
if (isUrl(input)) {
  ({ data, mimeType } = await loadFromUrl(input));
} else if (input.startsWith("data:")) {
  ({ data, mimeType } = loadFromBase64(input));
} else if (isFilePath(input)) {
  ({ data, mimeType } = await loadFromFilePath(input));
} else {
  ({ data, mimeType } = loadFromBase64(input));
}
```

**Why it works:** Data URLs have a distinctive prefix that never appears in file paths. Checking it first eliminates false positives before the more general path detection runs.

**Rule of thumb:** When detecting input types from strings, always check the most specific patterns first (protocol prefixes like `http://`, `data:`) before general patterns (contains `/`).

---

## Challenge 3: Base64 Validation — Buffer.from Silently Accepts Garbage

**Symptom:** `normalizeImage("data:image/png;base64,!!!invalid")` doesn't throw `VisualAIImageError`. Instead, sharp throws an untyped `Error: Input buffer contains unsupported image format`.

**Root Cause:** `Buffer.from("!!!invalid", "base64")` does not throw. Node.js silently ignores invalid base64 characters and returns a buffer of garbage bytes. Those bytes then reach sharp, which throws its own error — but it's not our typed error.

**Solution:** Validate base64 characters with regex before calling `Buffer.from()`:

```typescript
// Validate base64 characters before decoding
if (!/^[A-Za-z0-9+/\n\r]+=*$/.test(base64Data)) {
  throw new VisualAIImageError("Invalid base64 string");
}

const data = Buffer.from(base64Data, "base64");

if (data.length === 0) {
  throw new VisualAIImageError("Empty image data after base64 decode");
}
```

**Why it works:** The regex ensures only valid base64 alphabet characters (A-Z, a-z, 0-9, +, /, =, whitespace) are present before decoding. This catches invalid input early with a typed error, preventing garbage bytes from reaching downstream libraries.

**Key insight:** Never trust `Buffer.from(str, "base64")` to validate input. It's a decoder, not a validator.

---

## Challenge 4: Dynamic SDK Imports with Strict TypeScript

**Symptom:** TypeScript TS2352 error when casting `await import("@anthropic-ai/sdk")` to internal interface types: `Conversion of type ... may be a mistake because neither type sufficiently overlaps`.

**Root Cause:** The actual SDK types (complex class hierarchies, overloaded methods) don't match our simplified internal interfaces (`Record<string, unknown>`). TypeScript's strict mode rejects direct casts between insufficiently overlapping types.

**Solution:** Cast through `unknown` as an intermediate step:

```typescript
// DON'T: direct cast fails strict checks
const mod = (await import("@anthropic-ai/sdk")) as { default: AnthropicConstructor };

// DO: cast to unknown first, then extract properties
let Anthropic: unknown;
try {
  const mod: unknown = await import("@anthropic-ai/sdk");
  Anthropic = (mod as { default: unknown }).default;
} catch {
  throw new VisualAIConfigError("Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk");
}

// Use with constructor pattern
this.client = new (Anthropic as new (opts: { apiKey: string }) => unknown)({ apiKey });

// Cast response properties individually
const message = (await messages.create(params)) as {
  content: { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number };
};
```

**Why it works:** `unknown` is TypeScript's universal escape hatch — any type can be assigned to `unknown`, and `unknown` can be cast to any type. This satisfies the type checker while acknowledging the runtime uncertainty inherent in dynamic imports.

---

## Challenge 5: ESLint Strict Rules vs Test Mocking Patterns

**Symptom:** ESLint reports errors in test files for `no-non-null-assertion` (on `mock.calls[0]!`), `no-useless-constructor` (on mock class constructors), and `no-unsafe-assignment`/`no-unsafe-member-access` (on mock return values).

**Root Cause:** These ESLint rules are valuable for production code but overly restrictive in tests. Test files legitimately use non-null assertions (expressing test assumptions), no-op constructors (mock classes), and unsafe access patterns (typing mock return values).

**Solution:** Add file-specific ESLint overrides:

```javascript
// eslint.config.mjs
{
  files: ["tests/**/*.ts"],
  rules: {
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-useless-constructor": "off",
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
  },
},
```

**Why it works:** ESLint's file-specific overrides apply only to matching patterns. Production code keeps strict rules; test files get targeted relaxations for legitimate patterns.

---

## Prevention Checklist

For any TypeScript library with tests, optional peer dependencies, and image/binary input:

- [ ] Create separate `tsconfig.test.json` extending main config
- [ ] ESLint `project` uses array syntax: `["tsconfig.json", "tsconfig.test.json"]`
- [ ] ESLint has file-specific rule overrides for `tests/**/*.ts`
- [ ] String input detection checks protocols first (http, https, data:) before paths
- [ ] Base64 input is regex-validated before `Buffer.from()`
- [ ] Dynamic imports cast through `unknown`, not direct type assertions
- [ ] Coverage thresholds set in vitest.config.ts (80%+ recommended)
- [ ] Package types validated with `@arethetypeswrong/cli --pack .`

## Related Resources

- [typescript-eslint: Linting with Type Information](https://typescript-eslint.io/getting-started/typed-linting/)
- [Node.js Buffer.from() docs](https://nodejs.org/api/buffer.html#static-method-bufferfromstring-encoding)
- [sharp documentation](https://sharp.pixelplumbing.com/)
- [tsup: Bundle TypeScript libraries](https://tsup.egoist.dev/)
- [Are The Types Wrong](https://arethetypeswrong.github.io/)

## Project References

- Plan: `docs/plans/2026-02-16-feat-visual-ai-assertions-library-plan.md`
- Brainstorm: `docs/brainstorms/2026-02-16-visual-reasoning-library-brainstorm.md`
- CLAUDE.md development guidelines
