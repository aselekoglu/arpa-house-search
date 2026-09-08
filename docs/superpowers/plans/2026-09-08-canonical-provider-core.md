# Canonical Listing + Provider Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement provider-agnostic Canonical Listing v1 and a stateless Provider Registry that future Realtor.ca and Custom Source adapters can share.

**Architecture:** Canonical listing normalization lives in a small domain module independent of storage and transport. Provider adapters implement an explicit stateless contract; ProviderRegistry validates, indexes, resolves, and health-checks adapters without provider-name branching.

**Tech Stack:** Node.js 22 ESM, built-in `node:crypto`, Mocha 11, Chai 6.

**Spec:** `docs/superpowers/specs/2026-09-08-canonical-provider-core-design.md`

## Global Constraints

- New ARPA providers must not use mutable module-level `init()` configuration.
- Canonical identity is derived only from `providerId + sourceListingId`, never price/title/address.
- `providerId`, `sourceListingId`, and absolute listing `url` are required.
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

- [ ] **Step 1: Write failing tests** for required identity, stable id across price changes, numeric/currency normalization, timestamp defaults/order, coordinate validation, and defensive `raw` copy.
- [ ] **Step 2: Run** `node --import ./test/esmock-loader.mjs ./node_modules/mocha/bin/mocha.js test/domain/canonicalListing.test.js` and verify RED because the module does not exist.
- [ ] **Step 3: Implement minimal domain module** using `node:crypto` SHA-256 for stable identity and focused helper functions for nullable strings/numbers/timestamps.
- [ ] **Step 4: Re-run the focused test** and verify GREEN.
- [ ] **Step 5: Run `yarn lint`** and commit the task.

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

- [ ] **Step 1: Write failing tests** for malformed adapter rejection, duplicate ids/domains, id lookup, subdomain URL resolution, capability metadata, module loading, and health-check failure isolation.
- [ ] **Step 2: Run focused registry test** and verify RED because registry modules do not exist.
- [ ] **Step 3: Implement contract validation** requiring `id`, `name`, `domains`, `discover`, and `normalize`; infer optional capabilities from method presence while accepting explicit capability flags only when consistent.
- [ ] **Step 4: Implement ProviderRegistry** with normalized lower-case hostnames, deterministic registration order, null lookup for unknown providers, and structured health results.
- [ ] **Step 5: Re-run focused registry test** and verify GREEN.
- [ ] **Step 6: Run `yarn lint`** and commit the task.

### Task 3: Core Verification + Workboard State

**Files:**
- Modify: `.github/workflows/arpa-foundation.yml`
- Modify: `docs/architecture/provider-contract.md` if its existing text conflicts with the implemented interface.

**Interfaces:**
- CI adds the two M1 core unit-test files to the deterministic suite without enabling live provider tests.

- [ ] **Step 1: Add focused canonical/registry tests to deterministic CI** while preserving install, lint, and frontend build.
- [ ] **Step 2: Push branch and verify the GitHub Actions run is green.**
- [ ] **Step 3: Update Notion #6 and #7 from Backlog/In Progress to Done only after the green run; record the branch/commit and verification result in Notes.**
- [ ] **Step 4: Open a PR from `m1/canonical-provider-core` to `main` with #6/#7 acceptance criteria and verification evidence.**
