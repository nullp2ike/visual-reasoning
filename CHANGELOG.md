# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Gemini 3.5 Flash (`gemini-3.5-flash`)** as a supported Google model. Pricing: $1.50 / $9.00 per MTok input/output. Positioned by Google as their strongest agentic and coding model. Opt-in only — `gemini-3-flash-preview` remains the Google default because validation showed `gemini-3.5-flash` interprets the annotated-diff prompt inconsistently (sometimes returns a binary pixel-difference mask instead of the requested overlay).
- `gemini-3.5-flash` added to the annotated-diff allowlist so explicit `compare(..., { diffImage: true })` calls with this model don't throw. The compare auto-trigger remains restricted to `gemini-3-flash-preview` for predictable annotation quality.

### Changed

- `generateAiDiff()` allowlist error message now lists both supported diff models instead of naming only `gemini-3-flash-preview`.

## [0.11.0] - 2026-05-11

### Added

- **`Accessibility.COLOR_BLINDNESS`** check: flags color choices likely to be indistinguishable to viewers with common color vision deficiencies (e.g., red/green deuteranopia/protanopia, blue/purple confusion). Use it to catch charts, status indicators, and other meaningful color pairings that rely on commonly confused hues.
- **`Accessibility.COLOR_ALONE`** check: flags information conveyed by color alone, without a non-color cue. Use it to catch required fields, error states, chart legends, link styling, and other meaning that's encoded only through hue (no icon, text, pattern, or position).
- Two new default edge rules for the accessibility template: purely decorative color (branding, backgrounds, gradients) is exempt, and hover/focus state colors are not assumed if not visible in the screenshot.

### Notes for upgraders

- `ai.accessibility(screenshot)` (no options) now also evaluates the two new checks, so the default check set goes from 3 statements to 5. Passing screenshots that have meaningful color-only cues may start failing where they previously passed.
- To preserve prior behavior, pass an explicit `checks` array: `{ checks: [Accessibility.CONTRAST, Accessibility.READABILITY, Accessibility.INTERACTIVE_VISIBILITY] }`.

## [0.10.0] - 2026-05-06

### Added

- **`VISUAL_AI_DEBUG_FRAMES` env flag** persists sampled video frames to disk for offline debugging. Set to `"true"` or `"1"` and the library writes each sampled JPEG (filename includes index and timestamp) to `./visual-ai-debug-frames/<timestamp>-<id>/`. Override the base directory with `VISUAL_AI_DEBUG_FRAMES_DIR=/some/path`. Best-effort: disk failures are warned to stderr and never break the actual provider call. No effect on image-only inputs.

### Changed

- **Video support installs out of the box.** `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, and `@ffprobe-installer/ffprobe` moved from optional peer dependencies to regular `dependencies`. No more separate `npm install --save-dev fluent-ffmpeg @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe` step — `npm install visual-ai-assertions` is enough to use video input.

### Notes for upgraders

- **Install footprint grows by ~40–50 MB** because `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe` bundle platform-specific ffmpeg/ffprobe binaries. Image-only consumers who care about install size can prune them with `npm prune` or your package manager's equivalent; runtime image flows do not import ffmpeg.
- If you previously installed the three packages manually as devDependencies, you can remove them — they now come transitively from `visual-ai-assertions`.
- `VisualAIVideoError` is still thrown when video input is passed but ffmpeg can't be loaded (e.g., unsupported platform binary, pruned install). The error path is unchanged.

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
