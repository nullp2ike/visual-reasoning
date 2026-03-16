---
title: "feat: Composable prompt blocks with domain context and confidence"
type: feat
status: active
date: 2026-03-05
deepened: 2026-03-05
---

# feat: Composable prompt blocks with domain context and confidence

## Enhancement Summary

**Deepened on:** 2026-03-05
**Agents used:** TypeScript reviewer, Architecture strategist, Code simplicity reviewer, Pattern recognition specialist, Performance oracle, Best practices researcher

### Key Improvements from Deepening

1. **Simplified architecture** — Dropped `PromptBlocks`/`composePrompt` abstraction layer; add role + edge rules directly to existing builders (simplicity reviewer)
2. **Removed YAGNI** — Dropped `skipDefaultEdgeRules`, `BaseTemplateOptions`, `mergeEdgeRules` utility, `ChangeEntry.type` enum (simplicity reviewer)
3. **Fixed divergent taxonomy** — Removed `issues` from `CompareResult`; `changes` is the single source of truth (TypeScript + pattern reviewers)
4. **Improved type safety** — Tighten `CHECK_STATEMENTS` record keys, extract `BaseResultSchema`, generic `parseResponse<T>` helper, `readonly` modifiers (TypeScript reviewer)
5. **Anchored confidence scale** — Research shows raw LLM confidence is unreliable; use anchored descriptions in prompt (best practices researcher)
6. **Merged Phase 1+2** — Not independently shippable; combine into single phase (simplicity reviewer)

### New Considerations Discovered

- **Native structured outputs** are available on all 3 providers (OpenAI json_schema, Anthropic zodOutputFormat beta, Gemini responseMimeType). Future improvement opportunity — not in scope for this PR but should be a follow-up.
- **Personas don't improve accuracy** — Research (arxiv 2311.10054v3) shows role personas have negligible effect. The role blocks should be task-specific behavioral instructions, not personas.
- **Edge rules should be reactive** — Add rules only when specific failures are observed in testing. Start with 2-3 per template max.

---

## Overview

Improve the prompt system to get better, more consistent results from vision models. Add domain-specific task instructions per template, targeted edge case rules, an anchored `confidence` field on statement results, and redesign the compare prompt for regression testing. This is a **semver major release** due to the new `CompareResult` type.

## Problem Statement / Motivation

The current prompts have three weaknesses:

1. **No domain context** — All templates delegate to `buildCheckPrompt()` with a generic "visual QA assistant" role. The model gets no indication it's performing an accessibility audit vs. a layout review, limiting its ability to apply domain-specific reasoning.

2. **No edge case guidance** — Prompts don't address ambiguous situations (partially visible elements, borderline contrast, screenshot boundaries), leading to inconsistent results.

3. **Weak compare prompt** — The compare prompt is generic and doesn't support the primary use case (regression testing). It provides no structure for categorizing changes or distinguishing intentional from unintentional differences.

## Proposed Solution

### Direct prompt enrichment (no abstraction layer)

Add `role` and `edgeRules` optional parameters directly to the existing `buildCheckPrompt` function. Templates pass their domain-specific role and edge rules through this parameter. No new `composePrompt` function or `PromptBlocks` interface — the existing builders already compose strings and just need 2 more sections prepended.

### Research Insight: Task Instructions, Not Personas

Research across 4 LLM families and 2,410 questions shows that persona prompting ("You are an expert X") produces effects statistically indistinguishable from random. What works is **task-specific behavioral instructions** — direct, concrete directions about what to look for and how to evaluate it. The role blocks in this plan are written as task instructions, not personas.

### Confidence field with anchored scale

Add `confidence?: "high" | "medium" | "low"` as an **optional** field on `StatementResultSchema`. Research shows raw LLM confidence is unreliable, so the prompt uses **anchored descriptions** that map each level to specific visual conditions:

- **high**: Element is clearly visible/absent with no ambiguity
- **medium**: Element is present but partially obscured, small, or borderline
- **low**: Cannot determine with certainty from the screenshot

### Compare redesign

- New `CompareResult` type with `changes` array as single source of truth (no `issues` array — avoids divergent taxonomy)
- New `CompareResultSchema` Zod schema
- New `parseCompareResponse()` parser (extracted from generic `parseResponse<T>` helper)
- `client.compare()` return type changes from `CheckResult` to `CompareResult`
- `prompt` parameter becomes optional (defaults to regression testing prompt)

### Edge rule overrides

- Merge (append) semantics — user-provided rules are appended to defaults
- Edge rules are `string[]` — plain text sentences
- No `skipDefaultEdgeRules` (YAGNI — users who want full control can use `check()` directly)

## Technical Approach

### Phase 1: Types, schemas, prompts, and templates

All foundation work lands together — types, schemas, prompt changes, and template updates are not independently shippable.

#### 1.1 Update `StatementResultSchema` — `src/types.ts`

```typescript
const StatementResultSchema = z.object({
  statement: z.string(),
  pass: z.boolean(),
  reasoning: z.string(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});
```

#### 1.2 Extract `BaseResultSchema` — `src/types.ts`

Prevent structural drift between `CheckResult` and `CompareResult`:

```typescript
const BaseResultSchema = z.object({
  pass: z.boolean(),
  reasoning: z.string(),
  usage: UsageInfoSchema.optional(),
});

const CheckResultSchema = BaseResultSchema.extend({
  issues: z.array(IssueSchema),
  statements: z.array(StatementResultSchema),
});

const ChangeEntrySchema = z.object({
  description: z.string(),
  severity: IssuePrioritySchema, // reuse existing "critical" | "major" | "minor" enum
});

const CompareResultSchema = BaseResultSchema.extend({
  changes: z.array(ChangeEntrySchema).max(50), // bound output tokens
});

type ChangeEntry = z.infer<typeof ChangeEntrySchema>;
type CompareResult = z.infer<typeof CompareResultSchema>;
```

### Research Insights: Schema Design

- **Reuse `IssuePrioritySchema`** for `ChangeEntry.severity` instead of defining a duplicate enum (TypeScript reviewer)
- **Drop `ChangeEntry.type` enum** — the `description` field already conveys what kind of change it is. Add categorization later only if users request it (simplicity reviewer)
- **Drop `issues` from `CompareResult`** — having both `issues` (with priority/category) and `changes` (with severity) creates a divergent taxonomy. The model would populate two overlapping arrays inconsistently. `changes` is the single source of truth (pattern recognition + TypeScript reviewers)
- **Bound `changes` array with `.max(50)`** — prevents runaway output tokens if the model enumerates pixel-level differences (performance oracle)

#### 1.3 Add `edgeCaseRules` directly to existing option types — `src/types.ts`

No `BaseTemplateOptions` inheritance — just add the field to each type that needs it:

```typescript
interface AccessibilityOptions {
  checks?: ("contrast" | "readability" | "interactive-visibility")[];
  edgeCaseRules?: readonly string[];
}

interface LayoutOptions {
  checks?: ("overlap" | "overflow" | "alignment")[];
  edgeCaseRules?: readonly string[];
}

interface ContentOptions {
  checks?: ("placeholder-text" | "error-messages" | "broken-images")[];
  edgeCaseRules?: readonly string[];
}

interface PageLoadOptions {
  expectLoaded?: boolean;
  edgeCaseRules?: readonly string[];
}
```

### Research Insight: Flat Over Hierarchical

The simplicity reviewer identified `BaseTemplateOptions` as unnecessary abstraction for 2 optional fields across 5 interfaces. TypeScript structural typing already handles compatibility — callers can pass `{ edgeCaseRules: [...] }` as an inline object to any method that accepts it. The `readonly` modifier on the array signals that the library won't mutate user-provided rules (TypeScript reviewer).

#### 1.4 Tighten `CHECK_STATEMENTS` record keys — all templates

Fix existing type hole. Currently `Record<string, string>` allows any key; the `.filter(Boolean)` guard is compensating for loose typing:

```typescript
// Before (loose):
const CHECK_STATEMENTS: Record<string, string> = { contrast: "..." };

// After (strict):
const CHECK_STATEMENTS: Record<(typeof ALL_CHECKS)[number], string> = {
  contrast: "...",
  readability: "...",
  "interactive-visibility": "...",
};
```

This eliminates the `.filter((s): s is string => s !== undefined)` guard — every valid check key is guaranteed to have a value at compile time.

#### 1.5 Extract shared output schema constants — `src/core/prompt.ts`

Extract `CHECK_OUTPUT_SCHEMA`, `QUERY_OUTPUT_SCHEMA`, `COMPARE_OUTPUT_SCHEMA` as module-level constants. The check schema includes the anchored confidence instruction:

```typescript
const CHECK_OUTPUT_SCHEMA = `Respond with a JSON object matching this exact structure:
{
  "pass": boolean,          // true ONLY if ALL statements are true
  "reasoning": string,      // brief overall summary
  "issues": [...],          // issues found (empty array if all pass)
  "statements": [
    {
      "statement": string,  // the original statement text
      "pass": boolean,      // whether this statement is true
      "reasoning": string,  // explanation for this statement
      "confidence": "high" | "medium" | "low"
        // high = clearly visible/absent with no ambiguity
        // medium = present but partially obscured, small, or borderline
        // low = cannot determine with certainty from the screenshot
    }
  ]
}
${ISSUE_SCHEMA_INSTRUCTIONS}

Only include issues for statements that fail. If all statements pass, issues should be an empty array.
${JSON_INSTRUCTIONS}`;
```

### Research Insight: Anchored Confidence Scales

Raw self-reported LLM confidence is unreliable (ECE >40%). Anchoring each level to specific visual conditions forces the model to map its certainty to observable phenomena rather than abstract percentages. The descriptions above were chosen to match the visual assertion domain.

#### 1.6 Refactor `buildCheckPrompt` — `src/core/prompt.ts`

Add optional `role` and `edgeRules` parameters. No new `composePrompt` function — just prepend sections to the existing string template:

```typescript
interface CheckPromptOptions {
  readonly role?: string;
  readonly edgeRules?: readonly string[];
}

export function buildCheckPrompt(
  statements: string | string[],
  options?: CheckPromptOptions,
): string {
  const stmts = Array.isArray(statements) ? statements : [statements];
  const statementsBlock = stmts.map((s, i) => `${i + 1}. "${s}"`).join("\n");

  const role =
    options?.role ??
    "You are a visual QA assistant. Evaluate the provided image precisely and objectively.";

  const sections = [role];

  if (options?.edgeRules && options.edgeRules.length > 0) {
    sections.push(
      "Rules for handling edge cases:\n" + options.edgeRules.map((r) => `- ${r}`).join("\n"),
    );
  }

  sections.push(`Statements to evaluate:\n${statementsBlock}`);
  sections.push(CHECK_OUTPUT_SCHEMA);

  return sections.join("\n\n");
}
```

### Research Insight: Why No `composePrompt` Abstraction

The simplicity reviewer correctly identified that `PromptBlocks` + `composePrompt` is an over-abstraction for 3 builder functions that are already doing string composition. The proposed `composePrompt` was just `sections.join("\n\n")` — adding an interface and function for trivial string concatenation adds cognitive overhead without value. The existing builders are the right abstraction level.

#### 1.7 Refactor `buildQueryPrompt` — `src/core/prompt.ts`

Also migrate to the role + edge rules pattern for consistency (architecture strategist):

```typescript
export function buildQueryPrompt(userPrompt: string, options?: CheckPromptOptions): string {
  const role =
    options?.role ??
    "You are a visual QA assistant. Analyze the provided image based on the user's request.";

  const sections = [role];

  if (options?.edgeRules && options.edgeRules.length > 0) {
    sections.push(
      "Rules for handling edge cases:\n" + options.edgeRules.map((r) => `- ${r}`).join("\n"),
    );
  }

  sections.push(`User request: ${userPrompt}`);
  sections.push(QUERY_OUTPUT_SCHEMA);

  return sections.join("\n\n");
}
```

#### 1.8 Redesign `buildComparePrompt` — `src/core/prompt.ts`

```typescript
const COMPARE_ROLE =
  "You are performing a visual regression test. Compare the BEFORE image (baseline) to the AFTER image (current) and identify all visual differences. Flag changes that appear unintentional or problematic.";

const COMPARE_EDGE_RULES = [
  "The BEFORE image is the baseline/expected state.",
  "Flag removals and layout changes as higher severity. Color and spacing changes are lower severity unless they break readability.",
  "If the images appear identical, report no changes and pass.",
];

export function buildComparePrompt(userPrompt?: string): string {
  const evaluation = userPrompt
    ? `User request: ${userPrompt}`
    : "Identify all visual differences between the baseline and current screenshot. Flag any changes that appear unintentional or problematic.";

  const sections = [
    COMPARE_ROLE,
    "Rules for handling edge cases:\n" + COMPARE_EDGE_RULES.map((r) => `- ${r}`).join("\n"),
    evaluation,
    COMPARE_OUTPUT_SCHEMA,
  ];

  return sections.join("\n\n");
}
```

### Research Insight: Compare Edge Rules Simplified

Dropped the instruction to "categorize each change as: structural/stylistic/content/removal" since `ChangeEntry.type` was removed. The edge rules now focus on severity assessment, which is what matters for CI pass/fail decisions.

#### 1.9 Define domain roles and edge rules per template — `src/templates/*.ts`

**Accessibility** (`src/templates/accessibility.ts`):

```typescript
const ACCESSIBILITY_ROLE =
  "Evaluate this screenshot for visual accessibility. Focus on what you can actually perceive — apparent contrast levels, text legibility, and visual distinctiveness of interactive elements.";

const ACCESSIBILITY_EDGE_RULES = [
  "Do not state specific contrast ratios. Describe contrast as 'appears sufficient' or 'appears low'.",
  "Dark mode and light mode themes are both valid. Do not flag a valid dark theme as a contrast issue.",
];
```

**Layout** (`src/templates/layout.ts`):

```typescript
const LAYOUT_ROLE =
  "Evaluate this screenshot for visual layout problems — overlapping elements, content that appears cut off or overflowing, and inconsistent alignment patterns.";

const LAYOUT_EDGE_RULES = [
  "Intentional overlaps (stacked avatars, dropdown menus, overlapping cards) are acceptable. Flag only overlaps that obscure content or appear broken.",
  "Scrollable containers with partially visible content are not overflow issues.",
];
```

**Content** (`src/templates/content.ts`):

```typescript
const CONTENT_ROLE =
  "Evaluate this screenshot for content quality problems — placeholder or dummy content, error states, and broken resources that should not appear in a production UI.";
// No template-specific edge rules needed initially.
```

**Page Load** (`src/templates/page-load.ts`):

```typescript
const PAGE_LOAD_ROLE =
  "Evaluate whether this page has finished loading. Look for loading indicators, empty content areas, and missing resources.";
// No template-specific edge rules needed initially.
```

**Missing Elements** (`src/templates/missing-elements.ts`):

```typescript
const MISSING_ELEMENTS_ROLE =
  "Check whether specific UI elements are present and visible in this screenshot.";

const MISSING_ELEMENTS_EDGE_RULES = [
  "If an element is partially visible (cut off by screenshot boundary), treat it as visible but note the partial visibility in your reasoning.",
];
```

### Research Insight: Reactive Edge Rules

Best practices research shows that 3-5 specific rules addressing observed failures help, but 7+ rules (especially abstract ones) are counterproductive. The plan starts with 0-2 edge rules per template and adds more only when specific failures are observed during testing. The `GENERAL_EDGE_RULES` shared constant was dropped — general rules like "only evaluate what's visible" are better expressed once in the role text than repeated across every template.

#### 1.10 Reword unreliable statement checks

| File                        | Current                                                                                                     | Improved                                                                                                                       | Reason                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `accessibility.ts` contrast | "...sufficient color contrast (at least 4.5:1 ratio for normal text, 3:1 for large text per WCAG AA)"       | "All text and interactive elements appear to have sufficient color contrast — text is clearly readable against its background" | Models can't compute ratios               |
| `layout.ts` overflow        | "No content overflows its container or extends beyond the visible viewport..."                              | "No content appears to be unintentionally cut off or extending beyond its container boundaries"                                | Distinguish overflow from screenshot edge |
| `page-load.ts` loaded       | "The page appears fully loaded — no loading spinners, skeleton screens, or progress indicators are visible" | "The page content has finished loading — no spinning indicators, skeleton placeholders, or progress bars are visible"          | More specific about loading artifacts     |

#### 1.11 Refactor each template to pass role + edge rules

Each template merges user-provided edge rules with defaults (inline, no utility function):

```typescript
// src/templates/accessibility.ts
export function buildAccessibilityPrompt(options?: AccessibilityOptions): string {
  const checks = options?.checks ?? [...ALL_CHECKS];
  const statements = checks.map((c) => CHECK_STATEMENTS[c]);

  const edgeRules = options?.edgeCaseRules
    ? [...ACCESSIBILITY_EDGE_RULES, ...options.edgeCaseRules]
    : ACCESSIBILITY_EDGE_RULES;

  return buildCheckPrompt(statements, { role: ACCESSIBILITY_ROLE, edgeRules });
}
```

### Research Insight: Inline Over Utility

The simplicity reviewer identified `mergeEdgeRules` as a function that shouldn't exist — it's 2 lines of array spreading. Inlining the logic at each call site is clearer and eliminates a utility function + its 4 unit tests.

#### 1.12 Extract generic `parseResponse<T>` — `src/core/response.ts`

The existing code already duplicates JSON-stripping and Zod validation between `parseCheckResponse` and `parseQueryResponse`. Adding a third parser (`parseCompareResponse`) is the right time to extract the common logic:

```typescript
function parseResponse<T>(raw: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new VisualAIResponseParseError(
      `Failed to parse AI response as JSON: ${raw.slice(0, 200)}`,
      raw,
    );
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new VisualAIResponseParseError(
      `AI response does not match expected schema: ${result.error.message}`,
      raw,
    );
  }
  return result.data;
}

export function parseCheckResponse(raw: string): Omit<CheckResult, "usage"> {
  return parseResponse(raw, CheckResultSchema.omit({ usage: true }));
}

export function parseQueryResponse(raw: string): Omit<QueryResult, "usage"> {
  return parseResponse(raw, QueryResultSchema.omit({ usage: true }));
}

export function parseCompareResponse(raw: string): Omit<CompareResult, "usage"> {
  return parseResponse(raw, CompareResultSchema.omit({ usage: true }));
}
```

#### 1.13 Export new types — `src/index.ts`

Export `CompareResult`, `ChangeEntry`, and updated schemas. No `BaseTemplateOptions`, `MissingElementsOptions`, or `CheckOptions` exports needed — TypeScript structural typing handles compatibility for callers.

### Phase 2: Client API updates

#### 2.1 Update `client.check()` signature — `src/core/client.ts`

```typescript
async check(
  image: ImageInput,
  statements: string | string[],
  options?: { edgeCaseRules?: readonly string[] },
): Promise<CheckResult>
```

Pass `options?.edgeCaseRules` through to `buildCheckPrompt`.

#### 2.2 Update `client.compare()` — `src/core/client.ts`

```typescript
async compare(
  imageA: ImageInput,
  imageB: ImageInput,
  prompt?: string,
): Promise<CompareResult>
```

Use `parseCompareResponse` instead of `parseCheckResponse`. `prompt` is now optional.

### Research Insight: Compare `pass` Semantics

With the redesigned compare, `pass: true` means "no changes flagged as critical or major severity." Stylistic/minor changes alone don't cause failure. This is the right default for CI gating — only structural regressions should break the build.

#### 2.3 Update `client.missingElements()` — `src/core/client.ts`

```typescript
async missingElements(
  image: ImageInput,
  elements: string[],
  options?: { edgeCaseRules?: readonly string[] },
): Promise<CheckResult>
```

#### 2.4 Update `VisualAIClient` interface — `src/core/client.ts`

Match all method signatures to the new parameter types and return types.

### Phase 3: Tests

Tests are written **before** implementation per project conventions, but listed here in implementation order for clarity.

#### 3.1 Schema tests for confidence — `tests/types.test.ts`

- StatementResult with confidence present (each value)
- StatementResult with confidence absent (still valid)
- StatementResult with invalid confidence value (rejected)

#### 3.2 Schema tests for CompareResult — `tests/types.test.ts`

- Valid CompareResult with changes
- Empty changes array
- Changes array exceeding max(50) (rejected)
- ChangeEntry schema validation (description + severity only)
- BaseResultSchema shared fields on both CheckResult and CompareResult

#### 3.3 Response parser tests — `tests/core/response.test.ts`

- `parseCompareResponse` happy path
- `parseCompareResponse` with missing fields
- `parseCheckResponse` with confidence field present
- `parseCheckResponse` with confidence field absent
- Generic `parseResponse<T>` error handling (invalid JSON, schema mismatch)

#### 3.4 Prompt builder tests — `tests/core/prompt.test.ts`

- `buildCheckPrompt` includes role text when provided
- `buildCheckPrompt` includes edge rules when provided
- `buildCheckPrompt` uses default role when none provided
- `buildCheckPrompt` omits edge rules section when none provided
- `buildQueryPrompt` includes role and edge rules
- `buildComparePrompt` with no prompt uses default evaluation text
- `buildComparePrompt` with custom prompt includes it
- Output schema constants include confidence field instruction

#### 3.5 Template prompt tests — `tests/templates/*.test.ts`

- Each template includes its domain role text (not generic "visual QA assistant")
- Each template includes default edge rules (where applicable)
- Edge rules merge with user-provided rules (append semantics)
- Reworded statements appear (not old wording)
- `CHECK_STATEMENTS` strict key typing verified (compile-time, no runtime filter)

#### 3.6 Client method tests — `tests/core/client.test.ts`

- `compare()` with no prompt uses default
- `compare()` returns CompareResult (not CheckResult)
- `check()` with edgeCaseRules passes them through
- `missingElements()` with edgeCaseRules

#### 3.7 Smoke tests — `tests/smoke/`

- Verify confidence field is returned by at least one provider
- Verify compare produces changes array with severity values
- Verify reworded accessibility check produces reasonable results
- Measure actual token delta before/after for budget validation

## Acceptance Criteria

### Functional Requirements

- [ ] All 5 templates include domain-specific task instruction text in prompts
- [ ] Templates with edge rules include them in the prompt
- [ ] User-provided edge rules are appended to defaults
- [ ] `StatementResult` has optional `confidence` field with anchored scale
- [ ] `client.compare()` returns `CompareResult` with `changes` array
- [ ] `client.compare()` works without a prompt parameter
- [ ] `client.check()` accepts optional edge case rules
- [ ] `client.missingElements()` accepts optional edge case rules
- [ ] Accessibility contrast check does NOT reference specific WCAG ratios
- [ ] Layout overflow check distinguishes container overflow from screenshot boundary
- [ ] `CHECK_STATEMENTS` uses strict record key typing (no `.filter(Boolean)`)
- [ ] All existing tests pass (updated for new types)
- [ ] New tests cover all added functionality

### Non-Functional Requirements

- [ ] Prompt overhead is < 150 extra input tokens per call (measure with debugLog)
- [ ] Output token increase from confidence field is < 30 tokens per call
- [ ] No breaking changes to `check()`, `query()`, or template methods (additive only)
- [ ] `compare()` breaking change is documented in CHANGELOG

### Quality Gates

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes with 80%+ coverage
- [ ] `pnpm build` succeeds
- [ ] Smoke tests pass with at least one provider

## Dependencies & Prerequisites

- No external dependencies needed
- All changes are internal to the library
- Requires bumping to next major version (semver) due to `CompareResult`

## Risk Analysis & Mitigation

| Risk                                            | Impact                               | Mitigation                                                                                     |
| ----------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Models ignore confidence instruction            | Confidence field always undefined    | Made it optional; anchored descriptions improve compliance; document as best-effort            |
| Longer prompts degrade response quality         | Worse results despite better prompts | Keep additions concise (~100 extra tokens); measure before/after with debugLog                 |
| Edge rules confuse some models                  | Unexpected behavior                  | Start with 0-2 rules per template; add reactively based on test failures                       |
| CompareResult breaking change                   | Downstream users break on upgrade    | Document in CHANGELOG; provide migration guide                                                 |
| Models return changes that don't fit the schema | Parse errors in production           | Zod `.max(50)` bounds the array; severity reuses existing enum; description is freeform string |

## Files to Modify

| File                                | Change                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`                      | Add confidence to StatementResult, extract BaseResultSchema, add ChangeEntry + CompareResult, add edgeCaseRules to option types, tighten CHECK_STATEMENTS key types |
| `src/core/prompt.ts`                | Add CheckPromptOptions, role + edgeRules params to buildCheckPrompt/buildQueryPrompt, redesign buildComparePrompt, extract output schema constants                  |
| `src/core/response.ts`              | Extract generic parseResponse<T>, add parseCompareResponse                                                                                                          |
| `src/core/client.ts`                | Update check/compare/missingElements signatures, VisualAIClient interface                                                                                           |
| `src/templates/accessibility.ts`    | Add role + edge rules constants, reword contrast check, use strict record keys                                                                                      |
| `src/templates/layout.ts`           | Add role + edge rules constants, reword overflow check, use strict record keys                                                                                      |
| `src/templates/content.ts`          | Add role constant, use strict record keys                                                                                                                           |
| `src/templates/page-load.ts`        | Add role constant, reword loaded check                                                                                                                              |
| `src/templates/missing-elements.ts` | Add role + edge rules, accept edgeCaseRules option                                                                                                                  |
| `src/index.ts`                      | Export CompareResult, ChangeEntry, updated schemas                                                                                                                  |
| `tests/types.test.ts`               | Confidence + CompareResult + BaseResult schema tests                                                                                                                |
| `tests/core/prompt.test.ts`         | Role, edge rules, output schema tests                                                                                                                               |
| `tests/core/response.test.ts`       | parseCompareResponse + generic parseResponse tests                                                                                                                  |
| `tests/templates/*.test.ts`         | Role, edge rules, reworded statements, strict key typing                                                                                                            |

## Future Improvements (Out of Scope)

- **Native structured outputs** — Migrate each provider driver to use its native structured output mechanism (OpenAI `json_schema`, Anthropic `zodOutputFormat`, Gemini `responseMimeType`). This would eliminate JSON parsing failures entirely. Should be a separate PR.
- **SteerConf confidence calibration** — For higher-quality confidence, use multi-sample consistency (ask 3 times with conservative/neutral/optimistic steering, report agreement). Too complex for v1.
- **Sensitivity/tolerance parameter for compare** — Let users set `strict`/`moderate`/`lenient` to control how aggressively changes are flagged.

## References & Research

- Brainstorm: `docs/brainstorms/2026-03-05-prompt-improvements-brainstorm.md`
- Past learning: `docs/solutions/integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md` — Provider response format variance
- Past learning: `docs/solutions/best-practices/type-safety-and-code-deduplication-review.md` — Typed record patterns
- Research: Persona prompting ineffectiveness — arxiv 2311.10054v3 (October 2024)
- Research: SteerConf confidence calibration — NeurIPS 2025
- Research: Midscene.js — open-source LLM visual testing (similar architecture, 10k+ stars)
