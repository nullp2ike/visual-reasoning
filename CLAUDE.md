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
- **ffmpeg deps are optional peer deps**: `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, and `@ffprobe-installer/ffprobe` are loaded dynamically only when video input is used. Image-only flows must keep working without them installed.
- **Image handling**: Always validate image input type and format before sending to providers. Auto-resize to provider limits.
- **Video handling**: Auto-detect via magic bytes / extension / data URL. Probe duration before any provider call and reject videos exceeding `maxDurationSeconds`. Sampled frames are passed to providers as ordinary `NormalizedImage`s — drivers must stay format-agnostic.
- **Errors over silent failures**: Throw typed errors (`VisualAIError` subclasses). Never swallow exceptions or return ambiguous results.
- **Keep prompts in dedicated functions**: Prompt text lives in `src/core/prompt.ts` and `src/templates/*.ts`, not inline in provider drivers.

## Project structure

- `src/core/` — Image + video normalization, frame extraction, prompt construction, response parsing, client
- `src/providers/` — Thin drivers for Anthropic, OpenAI, Google (one file each)
- `src/templates/` — Built-in prompt templates
- `src/types.ts` — Shared types and Zod schemas
- `src/errors.ts` — Typed error classes
- `tests/` — Mirrors src/ structure

## Naming conventions

- Files: kebab-case (`missing-elements.ts`)
- Types/interfaces: PascalCase (`CheckResult`, `ProviderDriver`)
- Functions: camelCase (`visualAI`, `normalizeImage`)
- Constants: UPPER_SNAKE_CASE (`DEFAULT_MAX_TOKENS`)
- Test files: `*.test.ts` in `tests/` directory

## Releasing a new version

1. Update `"version"` in `package.json`
2. Add a `## [X.Y.Z]` section at the top of [`CHANGELOG.md`](./CHANGELOG.md) covering every user-visible change (Added / Changed / Fixed / Notes for upgraders)
3. Run all checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
4. Commit: `git commit -m "Bump to vX.Y.Z: <summary of changes>"`
5. Tag: `git tag -a vX.Y.Z -m "vX.Y.Z: <summary>"`
6. Push: `git push origin main --tags`
7. Publish: `pnpm publish --access public`
