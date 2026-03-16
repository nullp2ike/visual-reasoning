---
title: "Vitest mock leaking: vi.clearAllMocks() does not clear queued mockResolvedValueOnce implementations"
date: 2026-03-10
category: test-failures
tags: [vitest, mocking, clearAllMocks, mockResolvedValueOnce, test-pollution, mock-leak]
modules: [tests/core/client.test.ts]
severity: medium
symptoms:
  - schema validation error in unrelated test
  - flaky test passes in isolation but fails in suite
  - unconsumed mockResolvedValueOnce leaks to next test consuming the same mock
root_cause: >
  A test set up mockGoogleGenerate.mockResolvedValueOnce(...) but threw before
  consuming it (error happened during image normalization). vi.clearAllMocks()
  only clears calls, instances, and results — it does NOT clear queued
  once-implementations. The unconsumed mock value leaked to the next test that
  called the same mock, causing a response shape mismatch and Zod schema
  validation failure.
fix: Remove unnecessary mock setup from tests that never consume it, or use vi.resetAllMocks() which does clear queued implementations.
---

# Vitest mock leaking: vi.clearAllMocks() does not clear queued mockResolvedValueOnce implementations

## Problem

A test ("passes reasoningEffort to google driver") consistently failed when run as part of the full suite but passed in isolation. The error was a Zod schema validation failure — the AI response was missing `issues` and `statements` fields.

```
VisualAIResponseParseError: AI response does not match expected schema: [
  { "path": ["issues"], "message": "Required" },
  { "path": ["statements"], "message": "Required" }
]
```

## Investigation

1. Confirmed the test passes in isolation with `vitest run -t "passes reasoningEffort to google driver"`
2. Confirmed the test consistently fails when the full file runs
3. Checked `beforeEach` — uses `vi.clearAllMocks()` which should reset state between tests
4. Tested on the main branch (pre-changes) — all tests passed, so the issue was introduced by new tests
5. Identified that a new test "propagates diff generation errors" set up `mockGoogleGenerate.mockResolvedValueOnce({text: makeCompareResponse(true), ...})` but the error occurred during `normalizeImage()` BEFORE the mock was ever called
6. Discovered that `vi.clearAllMocks()` does NOT clear queued `mockResolvedValueOnce` implementations — it only clears `.mock.calls`, `.mock.instances`, and `.mock.results`
7. The unconsumed `makeCompareResponse` value (which has `changes` but NOT `issues`/`statements`) was consumed by the next Google mock call in "passes reasoningEffort to google driver", causing the schema mismatch

## Solution

### Fix (Preferred): Remove the unnecessary mock setup

Since the test throws during `normalizeImage()` before any API call, the mock setup is dead code:

```typescript
// BEFORE (buggy) — mock is queued but never consumed
it("propagates diff generation errors", async () => {
  mockGoogleGenerate.mockResolvedValueOnce({
    text: makeCompareResponse(true),
    usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150 },
  });

  const ai = visualAI({ provider: "google", apiKey: "test" });
  const emptyImage = Buffer.alloc(0);
  // normalizeImage() throws here; the mock is never called
  // The queued value persists and poisons the next test
});

// AFTER (fixed) — no mock setup since it's never needed
it("propagates diff generation errors", async () => {
  const ai = visualAI({ provider: "google", apiKey: "test" });
  const emptyImage = Buffer.alloc(0);
  // normalizeImage() throws before any API call — no mock needed
});
```

### Alternative Fix: Use `vi.resetAllMocks()` instead of `vi.clearAllMocks()`

```typescript
beforeEach(() => {
  vi.resetAllMocks(); // instead of vi.clearAllMocks()
});
```

`resetAllMocks` clears implementations (including queued `mockResolvedValueOnce` values) in addition to call/instance/result metadata. This is a broader change and may require re-adding default mock implementations that other tests depend on.

### Key Takeaway: The mock clearing hierarchy

| Method                 | Clears calls/instances/results | Clears implementations | Clears queued `Once` values | Restores original (spyOn) |
| ---------------------- | ------------------------------ | ---------------------- | --------------------------- | ------------------------- |
| `vi.clearAllMocks()`   | Yes                            | No                     | **No**                      | No                        |
| `vi.resetAllMocks()`   | Yes                            | Yes                    | Yes                         | No                        |
| `vi.restoreAllMocks()` | Yes                            | Yes                    | Yes                         | Yes                       |

## Prevention

### Rule 1: Only mock what will be consumed

If a test is expected to throw before reaching a mocked function call, do not set up that mock. Unconsumed `mockResolvedValueOnce()` values stay in the queue and silently leak into the next test that invokes the same mock.

```typescript
// BAD — mock is set up but never consumed because validation throws first
it("throws on invalid input", async () => {
  mockApiCall.mockResolvedValueOnce({ result: "ok" }); // leaked!
  await expect(processImage(null)).rejects.toThrow("Invalid input");
});

// GOOD — no unnecessary mock setup
it("throws on invalid input", async () => {
  await expect(processImage(null)).rejects.toThrow("Invalid input");
});
```

### Rule 2: Consider `vi.resetAllMocks()` over `vi.clearAllMocks()`

`clearAllMocks()` does not drain the queue of once-values. `resetAllMocks()` does. Use `resetAllMocks()` as a safety net when test isolation is critical.

### Detection pattern: test passes alone, fails in suite

1. **Identify the unexpected data.** Does the assertion failure value look like it belongs to a different test?
2. **Search upward.** Find earlier tests that call `mockResolvedValueOnce` on the same mock.
3. **Check for early exits.** Does any of those tests throw, return early, or skip the code that would consume the mock?
4. **Confirm.** Temporarily add `vi.resetAllMocks()` in `beforeEach`. If the failure disappears, mock leakage is confirmed.

## Related References

### Internal Documentation

- `docs/solutions/integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md` — Documents limitations of `vi.mock()` for provider SDK testing and `vi.clearAllMocks()` patterns used across the test suite.
- `docs/solutions/best-practices/type-safety-and-code-deduplication-review.md` — Covers dead code paths that mocked tests never exercised.

### Repository Mock Usage

All test files use `vi.clearAllMocks()` exclusively in `beforeEach`:

- `tests/providers/anthropic.test.ts`, `tests/providers/openai.test.ts`, `tests/providers/google.test.ts`
- `tests/core/client.test.ts`, `tests/core/client-templates.test.ts`
- `tests/integration/full-flow.test.ts`

No usage of `vi.resetAllMocks()` or `vi.restoreAllMocks()` was found.

### External References

- [Vitest: vi.clearAllMocks()](https://vitest.dev/api/vi.html#vi-clearallmocks)
- [Vitest: vi.resetAllMocks()](https://vitest.dev/api/vi.html#vi-resetallmocks)
- [Vitest: vi.restoreAllMocks()](https://vitest.dev/api/vi.html#vi-restoreallmocks)
- [Jest: Mock function API](https://jestjs.io/docs/mock-function-api#mockfnmockclear) (Vitest mirrors this API)
