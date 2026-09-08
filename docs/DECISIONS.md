# Architecture decisions

## ADR-001 — Last MIT Fredy snapshot is the code baseline
Accepted. Baseline commit: `2a815c92e6da9cceb9633fb5b96086897a245c35`.

## ADR-002 — JavaScript/JSDoc first
Accepted for M0/M1. No backend TypeScript migration while domain boundaries are still evolving.

## ADR-003 — SQLite first
Accepted for the self-hosted initial workload.

## ADR-004 — One browser automation stack
Accepted. Keep Puppeteer/Cheerio; do not add Playwright without measured need.

## ADR-005 — Stateless provider direction
Accepted. The inherited provider API is usable but its mutable `init()` model is not the target for new ARPA providers.

## ADR-006 — Paper theme first
Accepted. Implement ARPA semantic tokens directly rather than porting later Fredy theme code.
