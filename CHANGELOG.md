# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
