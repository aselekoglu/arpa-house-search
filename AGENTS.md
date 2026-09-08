# ARPA House Search — agent guide

## Mission

Build a self-hosted multi-source rental search and decision-support tool, initially for Ottawa, Canada.

## Provenance boundary

The codebase starts from `orangecoding/fredy@2a815c92e6da9cceb9633fb5b96086897a245c35`, the final Fredy snapshot distributed under MIT. Do not copy or cherry-pick code from later Fredy commits unless its reuse is separately permitted. Reading later implementations for high-level architectural understanding is acceptable; implement ARPA functionality independently.

## Architecture rules

- Keep providers behind a common ingestion contract.
- Move toward stateless per-run provider configuration; never add new mutable module-scope run state.
- Prefer adapters and pipeline stages over site-specific conditionals in core services.
- Keep one Node runtime.
- Keep SQLite until measured load requires something else.
- Use the inherited Puppeteer/Cheerio stack; do not add a second browser automation framework without a demonstrated need.
- New provider work must use offline fixtures by default.
- Hard requirements and soft scoring are separate concerns.
- AI-derived observations must be labelled as inferred rather than factual listing data.

## M0/M1 discipline

During implementation run the smallest relevant checks. At integration boundaries run lint, frontend build, and deterministic/offline tests available for changed behavior. Do not claim a check passed without output from that check.
