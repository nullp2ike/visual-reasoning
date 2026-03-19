---
date: 2026-03-19
topic: check-result-consistency
---

# Fix Inconsistent Check Result Summaries

## Problem Frame

When `check()` returns results, the model sometimes produces a top-level `pass` or `reasoning` summary that contradicts the individual `statements[].pass` values (e.g., 3 passes + 2 failures but reasoning says "4 of 5 passed"). Users get misleading test results.

## Requirements

- R1. Improve the check prompt to instruct the model to evaluate statements first, then derive `pass` and `reasoning` from those individual results
- R2. After parsing the model response, compute `pass` as the logical AND of all `statements[].pass` values, overriding whatever the model returned
- R3. After parsing, recompute the `reasoning` summary string to reflect the actual pass/fail counts from `statements[]`
- R4. Ensure `issues` array only contains entries for statements where `pass` is false (filter out any inconsistencies)

## Success Criteria

- Top-level `pass` always equals the logical AND of all `statements[].pass` values
- `reasoning` summary count always matches actual pass/fail counts
- `issues` array never contains entries for passing statements
- Existing tests continue to pass

## Scope Boundaries

- Only affects `check()` flow — `ask()` and `compare()` are out of scope
- No changes to the Zod schema shape — post-processing happens after parsing
- No changes to provider drivers

## Key Decisions

- **Belt + suspenders approach**: Improve prompt AND add post-processing, so the system is correct even when the model hallucinates the summary
- **Post-processing overrides model output**: The computed values from `statements[]` are the source of truth, not the model's top-level fields

## Next Steps

→ `/ce:plan` for structured implementation planning
