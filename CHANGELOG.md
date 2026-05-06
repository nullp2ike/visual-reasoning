# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-05-06

### Added

- **Video input support** in `ai.check()` and `ai.ask()`. Pass an `.mp4`/`.webm`/`.mov`/`.mkv` file path, base64 string, data URL, `Buffer`, or `Uint8Array`; the library samples frames with ffmpeg and feeds them to the provider as a chronological timeline. Defaults: 1 fps, max 10 frames, max 10 s of source video. Override via `options.video: { fps, maxFrames, maxDurationSeconds }`.
- **Per-statement timestamps** for video checks: `StatementResult.timestampSeconds` reports approximately when each statement became true, or `null` if it failed or applies across the whole clip.
- **Frame metadata on results**: `CheckResult.frames` and `AskResult.frames` (`{ count, timestampsSeconds, durationSeconds }`) describe the sampled timeline the model saw.
- **`AskResult.frameReferences`** — for video asks, the model returns the indices of frames it relied on for the answer.
- **`VisualAIVideoError`** error class with code `VIDEO_INVALID`. Surfaces missing ffmpeg deps, oversized videos, decode failures, and timeouts.
- New exported types: `MediaInput`, `Frame`, `VideoSamplingOptions`, `VideoFramesMetadata`, `SupportedVideoMimeType`.
- Three new optional peer dependencies: `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`. Install only if you need video support; image-only flows continue to work without them.
- Hard wall-clock timeouts on the ffmpeg pipeline (15 s for `ffprobe`, 60 s for frame extraction) and a hard cap of 60 on `maxFrames` to keep memory bounded.

### Changed

- The first parameter of `check()` and `ask()` is now typed `MediaInput` (alias of `ImageInput`) and documented as accepting both images and short videos. No call-site change required for image consumers.

### Notes for upgraders

- **`VisualAIErrorCode` union widened** with `"VIDEO_INVALID"`. Downstream code with exhaustive `switch (error.code)` will get a TypeScript error until the new case is handled — see the README's Error Handling section for the recommended switch shape.
- **Template helpers (`accessibility`, `layout`, `pageLoad`, `content`, `elementsVisible`, `elementsHidden`) remain image-only.** Pass video to `check()` or `ask()` instead.
- **HTTP/HTTPS URLs are not accepted as video input.** Fetch the bytes yourself first and pass them as a `Buffer` or `data:` URL. Image URL fetch is unchanged.
- ffmpeg peer deps are declared with `peerDependenciesMeta.optional: true`. Modern npm/pnpm/yarn skip them by default; npm < 7 emits unmet-peer warnings that are harmless.

## [0.8.0]

- Claude Opus 4.7 model support.
- GPT-5.5 model support.
- Model-aware `xhigh` reasoning-effort mapping for Anthropic models.

## [0.7.2]

- Fix OpenAI Responses API `text.format` shape.

## [0.7.1]

- Fix OpenAI `json_object` format for newer models.

## [0.7.0]

- Truncation detection via `VisualAITruncationError`.
- Gemini 3.1 Flash Lite support.
- Reasoning-token usage exposed in `UsageInfo`.

## [0.6.0]

- Granular debug env vars (`VISUAL_AI_DEBUG_PROMPT`, `VISUAL_AI_DEBUG_RESPONSE`).
- `VISUAL_AI_REASONING_EFFORT` env var.

## [0.5.0]

- GPT-5.4 mini and nano model support.

## [0.4.0]

- Bundle all provider SDKs by default.

## [0.3.0]

- Bundle OpenAI SDK by default; update repo URLs.

## [0.2.0] - 2026-03-16

### Breaking Changes

- Renamed `query()` to `ask()`, `QueryResult` to `AskResult`, and `QueryResultSchema` to `AskResultSchema`.
- Renamed the `edgeCaseRules` option to `rules` across the public API.
- Narrowed `NormalizedImage.mimeType` from `string` to the `SupportedMimeType` literal union.

### Added

- Optional `AskOptions` with `rules` support for `ask()`.
- Stable `error.code` values on all public error classes for programmatic handling.
- `VisualAIErrorCode`, `VisualAIKnownError`, `SupportedMimeType`, and `isVisualAIKnownError` exports.
- JSDoc coverage across the public API surface.
- `sideEffects: false` package metadata for tree-shaking.

### Changed

- Provider drivers now accept config objects instead of positional constructor arguments.
- Config resolution moved into a dedicated core module.
- Debug logging, usage accounting, and duration tracking moved into a dedicated core module.
- Provider creation now uses a typed registry for exhaustive provider handling.
- README examples and API docs now reflect the flat constant exports and current method signatures.

### Fixed

- README template examples now use the correct flat imports (`Accessibility`, `Layout`, `Content`) instead of a nonexistent `Check` namespace.
- README configuration docs now correctly describe `trackUsage` as opt-in by default.
- Public packaging metadata now includes repository, homepage, bugs, and author fields.
