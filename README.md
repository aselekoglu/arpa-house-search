# ARPA House Search

ARPA House Search is a self-hosted rental discovery and decision-support application. The first market is Ottawa, Ontario: one place to search multiple rental sources, normalize listings, avoid duplicate review, apply hard requirements, rank viable homes transparently, and alert on strong new matches.

## First milestone

**M1 — Ottawa Vertical Slice**

A user can create an Ottawa search, retrieve listings from Realtor.ca plus one arbitrary custom rental page, and see both sources in a single feed. Re-running the search must update already-seen listings rather than treating them as new.

## Architecture direction

```text
provider -> normalize -> freshness -> enrichment -> hard filters
         -> cross-source matching -> explainable scoring -> persist/notify
```

Known sites get dedicated providers. Smaller or user-supplied sites use a configurable Custom Source adapter with static HTML or browser extraction.

## Development

```bash
nvm use
corepack enable
yarn install
yarn lint
yarn build:frontend
```

Provider tests in the inherited MIT baseline may touch live sites; do not use them as the default inner loop for new ARPA providers. New ARPA provider work should use offline fixtures.

## Origin and license

ARPA House Search is derived from the final Fredy snapshot that was distributed under the MIT License: `orangecoding/fredy@2a815c92e6da9cceb9633fb5b96086897a245c35` (December 10, 2025, Fredy 15.1.1).

Copyright and the MIT permission notice for that software are preserved in `LICENSE`. ARPA-specific work is developed independently. Later Fredy versions are treated as public architectural reference only unless their licensing separately permits reuse.

See `BASELINE.md` and `docs/LICENSE_STRATEGY.md`.
