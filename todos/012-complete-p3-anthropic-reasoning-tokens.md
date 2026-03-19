---
status: complete
priority: p3
issue_id: "012"
tags: [code-review, providers, feature-parity]
dependencies: []
---

# Anthropic provider does not extract reasoning tokens

## Resolution

Not actionable. Anthropic does not expose a separate thinking/reasoning token count in the Messages API response. Thinking tokens are rolled into `output_tokens` for billing. There is no field to extract.

OpenAI and Google both expose separate reasoning token counts, so those are already handled.
