# Brainstorm: Visual Reasoning Library

**Date:** 2026-02-16
**Status:** Complete

## What We're Building

A TypeScript library that people add as a dependency to their Playwright or WebDriverIO projects. It provides functions to send screenshots (and other images) with prompts to AI models that support visual reasoning (Claude Opus 4.6, GPT 5.2, Gemini Flash 3 Preview) and get back structured results.

### Target Users

Both QA engineers adding visual AI checks to existing test suites and full-stack developers writing E2E tests who want visual AI assertions.

### Core Capabilities

1. **Free-form prompts** - Send a screenshot + custom prompt, get a structured response
2. **Visual assertions** - Own assertion API (e.g. `visualCheck(image, prompt)`) returning pass/fail with reasoning
3. **Template prompts** - Built-in prompt templates for common checks: missing elements, accessibility issues, layout problems, etc.
4. **Image comparison** - Send two images, get a structured diff/analysis of what changed

## Why This Approach

**Architecture: Unified Core + Provider Drivers**

- A core module handles image normalization (accepts Buffer, file path, base64, URL), prompt construction, and response parsing into structured objects
- Each AI provider (Anthropic, OpenAI, Google) gets a thin driver that maps the core's internal format to the provider's SDK
- Users configure the provider once, then call simple functions

**Rationale:** Cleanly separates concerns without over-engineering. Adding a new provider means writing one driver file, not touching every function. Avoids the duplication of a flat library and the complexity of a plugin system.

## Key Decisions

| Decision             | Choice                                                       | Reasoning                                                                |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Language             | TypeScript (strict)                                          | Target audience uses TS, type safety is a priority                       |
| Package manager      | pnpm                                                         | Fast, strict resolution, modern TS library standard                      |
| Provider integration | Direct SDKs (@anthropic-ai/sdk, openai, @google/genai)       | Full control over each provider's capabilities                           |
| Image input          | Buffer, file path, base64 string, URL                        | Maximum flexibility for different test runner outputs                    |
| Multi-image          | Only for comparison function                                 | Keep single-image functions simple, multi-image for explicit comparisons |
| Response format      | Structured object `{ pass, reasoning, confidence, details }` | Typed, predictable, easy to assert on in tests                           |
| Assertion style      | Own API (not framework matchers)                             | Works with any test runner, no framework coupling                        |
| Template prompts     | Built-in set for common checks                               | Missing elements, accessibility, layout, styling checks                  |
| CLAUDE.md            | Test-first + type safety + CI checks                         | Enforce quality from the start with AI-assisted development              |
| Package name         | visual-ai-assertions                                         | Clear, descriptive, emphasizes assertion use case                        |
| Node version         | 18+                                                          | Current LTS, widest compatibility                                        |
| Library test runner  | Vitest                                                       | Fast, native ESM/TS, modern DX                                           |
| Custom templates     | Built-in only                                                | YAGNI - free-form prompts cover custom needs                             |
| Retry logic          | None (user handles)                                          | Keep library simple, throw errors immediately                            |

## CLAUDE.md Guidance Priorities

The CLAUDE.md file should establish:

1. **Test-first development** - Write tests before implementation, maintain high coverage
2. **Strict TypeScript** - No `any`, exhaustive types, Zod for runtime validation of AI responses
3. **CI feedback loop** - Run lint, typecheck, test, and build before every commit
4. **Project structure** - Clear src/ layout with core/, providers/, templates/ directories
5. **Naming conventions** - Consistent naming for functions, types, and files
6. **PR workflow** - What to check before submitting changes

## Resolved Questions

1. **Package name** - `visual-ai-assertions` - clear, descriptive, emphasizes the assertion use case
2. **Minimum Node version** - Node 18+ (current LTS) for widest compatibility
3. **Test runner for the library itself** - Vitest for fast native ESM/TS support
4. **Template prompt extensibility** - Built-in only; users use free-form prompts for custom needs (YAGNI)
5. **Retry/error handling** - No built-in retry; throw errors immediately, users handle retries themselves
