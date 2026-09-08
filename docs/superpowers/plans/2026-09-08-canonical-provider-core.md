# Canonical Listing + Provider Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement provider-agnostic Canonical Listing v1 and a stateless Provider Registry that future Realtor.ca and Custom Source adapters can share.

**Architecture:** Canonical listing normalization lives in a small domain module independent of storage and transport. Provider adapters implement an explicit stateless contract; ProviderRegistry validates, indexes, resolves, and health-checks adapters without provider-name branching. Fixed domains are optional so config-driven providers can target arbitrary sites without claiming global domain ownership.

**Tech Stack:** Node.js 22 ESM, built-in `node:crypto`, Mocha 11, Chai 6.

**Spec:** `docs/superpowers/specs/2026-09-08-canonical-provider-core-design.md`

## Global Constraints

- New ARPA providers must not use mutable module-level `init()` configuration.
- Canonical identity is derived only from `providerId + sourceListingId`, never price/title/address.
- `providerId`, `sourceListingId`, and absolute listing `url` are required.
- Fixed provider domains are optional; supplied domains must be valid and uniquely owned in the registry.
- No new runtime dependency is introduced for schema validation.
- Existing `lib/provider/` Fredy providers remain unchanged in this task.

---

### Task 1: Canonical Listing v1

**Files:**
- Create: `lib/domain/listing/canonicalListing.js`
- Create: `test/domain/canonicalListing.test.js`

**Interfaces:**
- Produces: `createCanonicalListing(input, { now } = {}) -> CanonicalListing`
- Produces: `canonicalListingId(providerId, sourceListingId) -> string`
- Produces: `CanonicalListingError extends Error`

- [x] **Step 1: Write failing tests** for required identity, stable id across price changes, numeric/currency normalization, timestamp defaults/order, coordinate validation, and defensive `raw` copy.
- [x] **Step 2: Run the focused test in CI** and verify RED because the module does not exist. RED evidence: workflow run `34237475023`, 22 passing / 1 expected failure.
- [x] **Step 3: Implement minimal domain module** using `node:crypto` SHA-256 for stable identity and focused helper functions for nullable strings/numbers/timestamps.
- [x] **Step 4: Re-run the focused/deterministic suite** and verify GREEN. Green evidence: workflow run `34237848492`.
- [x] **Step 5: Run `yarn lint`** through CI and commit the task.

### Task 2: Provider Adapter Contract + Registry

**Files:**
- Create: `lib/providers/core/providerContract.js`
- Create: `lib/providers/core/ProviderRegistry.js`
- Create: `lib/providers/core/index.js`
- Create: `test/providers/providerRegistry.test.js`

**Interfaces:**
- Consumes: Canonical listing contract concept from Task 1; registry itself does not normalize listings.
- Produces: `validateProviderAdapter(adapter) -> frozen metadata`
- Produces: `ProviderContractError extends Error`
- Produces: `new ProviderRegistry(adapters = [])`
- Produces registry methods: `register`, `get`, `resolveUrl`, `list`, `healthCheck`, `healthCheckAll`, `load`.

- [x] **Step 1: Write failing tests** for malformed adapter rejection, duplicate ids/domains, id lookup, subdomain URL resolution, capability metadata, module loading, and health-check failure isolation.
- [x] **Step 2: Run registry contract tests in CI** and verify RED because registry modules do not exist. RED evidence: workflow run `34238066920`, 30 passing / 1 expected failure.
- [x] **Step 3: Implement contract validation** requiring `id`, `name`, `discover`, and `normalize`; allow optional/empty fixed `domains`; infer optional capabilities from method presence while accepting explicit capability flags only when consistent.
- [x] **Step 4: Implement ProviderRegistry** with normalized lower-case hostnames, deterministic registration order, null lookup for unknown providers, immutable metadata, and structured health results.
- [x] **Step 5: Add a RED contract test for domainless config-driven providers** after review exposed the Custom Source requirement; verify the only failure is the old fixed-domain requirement. RED evidence: workflow run `34238577990`, 31 passing / 1 expected failure.
- [x] **Step 6: Make fixed domains optional and verify GREEN.** Green evidence: workflow run `34238733962`.

### Task 3: Core Verification + Workboard State

**Files:**
- Modify: `.github/workflows/arpa-foundation.yml`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PROVIDERS.md`
- Modify: `docs/superpowers/specs/2026-09-08-canonical-provider-core-design.md`

**Interfaces:**
- CI adds the two M1 core unit-test files to the deterministic suite without enabling live provider tests.

- [x] **Step 1: Add focused canonical/registry tests to deterministic CI** while preserving install, lint, and frontend build.
- [x] **Step 2: Push branch and verify the GitHub Actions run is green.** Latest implementation green evidence before docs-only alignment: run `34238733962`.
- [x] **Step 3: Update Notion #6 and #7 to Done only after the green run; record branch/verification evidence.**
- [ ] **Step 4: Commit final docs alignment and verify one final green CI run.**
- [ ] **Step 5: Open a PR from `m1/canonical-provider-core` to `main` with #6/#7 acceptance criteria and verification evidence.**
