# Search Profile v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated user persist an Ottawa rental Search Profile containing location, hard search bounds, enabled source references and interval schedule metadata, then expose the exact provider-facing profile context required by the M1 execution path.

**Architecture:** Add a small provider-agnostic Search Profile domain contract, user-owned SQLite persistence/lifecycle/API, and an ARPA-native Search Profiles page. Provider execution consumes a dedicated context mapper rather than storage rows directly. This task persists schedule intent but does not replace or integrate the inherited scheduler; scheduler integration remains #18.

**Tech Stack:** Node.js 22 ESM, Restana API, better-sqlite3 through `SqliteConnection`, React 19/Vite, existing ARPA UI primitives, Mocha/Chai deterministic tests.

**Spec:** Notion workboard `#15 Search Profile v1` and `M1_OTTAWA_VERTICAL_SLICE.md` section M1.6.

## Global Constraints

- Persist only M1 Search Profile fields: name, city/region, max price, minimum bedrooms, minimum bathrooms, enabled sources and schedule.
- Do not implement scoring, soft preferences, commute, destinations or notifications in this task.
- Default location is Ottawa, Ontario.
- Source references are explicit and provider-agnostic: `{ kind: 'provider' | 'custom-source', id: string }`.
- Schedule v1 is persistence-only here: `{ enabled: boolean, intervalMinutes: integer }`; actual scheduling is #18.
- Profiles are user-owned; reads and mutations must never cross user ownership boundaries.
- Provider-facing context uses the existing adapter field names: `city`, `region`, `maxPrice`, `minBedrooms`, `minBathrooms`.
- All new behavior is developed RED → GREEN with deterministic offline tests.

---

### Task 1: Search Profile domain contract and provider execution context

**Files:**
- Create: `lib/domain/search/searchProfile.js`
- Create: `lib/services/searchProfiles/profileExecutionContext.js`
- Test: `test/domain/searchProfile.test.js`
- Test: `test/services/searchProfiles/profileExecutionContext.test.js`
- Modify: `.github/workflows/arpa-foundation.yml`

**Interfaces:**
- Produces: `createSearchProfile(input, options?) -> SearchProfile`
- Produces: `validateSourceReference(input) -> {kind,id}`
- Produces: `createProfileExecutionContext(profile) -> { profile, enabledSources, schedule }`
- `context.profile` contains `id`, `name`, `city`, `region`, `maxPrice`, `minBedrooms`, `minBathrooms` and is safe to pass directly to provider `discover({ profile })`.

- [ ] **Step 1: Write failing domain tests**

```js
const profile = createSearchProfile({
  id: 'profile-1',
  userId: 'user-1',
  name: 'Ottawa 2BR',
  city: 'Ottawa',
  region: 'ON',
  maxPrice: 2400,
  minBedrooms: 2,
  minBathrooms: 1,
  enabledSources: [
    { kind: 'provider', id: 'realtor-ca' },
    { kind: 'custom-source', id: 'source-1' },
  ],
  schedule: { enabled: true, intervalMinutes: 15 },
});
expect(profile.city).to.equal('Ottawa');
expect(profile.enabledSources).to.have.length(2);
```

Cover invalid/duplicate source refs, non-Ottawa-empty location, numeric bounds, schedule bounds, defensive copies and timestamp ordering.

- [ ] **Step 2: Run CI and verify RED**

Expected: only the new Search Profile modules/tests fail because the modules do not exist.

- [ ] **Step 3: Implement the minimal immutable domain contract**

Use trimmed strings, finite non-negative numeric search bounds, `intervalMinutes` integer range `1..1440`, unique source key `${kind}:${id}`, and defensive copies. Default missing city/region to `Ottawa` / `ON`; do not invent defaults for price/beds/baths.

- [ ] **Step 4: Implement provider execution context mapper**

```js
export const createProfileExecutionContext = (profile) => Object.freeze({
  profile: Object.freeze({
    id: profile.id,
    name: profile.name,
    city: profile.city,
    region: profile.region,
    maxPrice: profile.maxPrice,
    minBedrooms: profile.minBedrooms,
    minBathrooms: profile.minBathrooms,
  }),
  enabledSources: profile.enabledSources.map((source) => Object.freeze({ ...source })),
  schedule: Object.freeze({ ...profile.schedule }),
});
```

- [ ] **Step 5: Run CI and verify GREEN**

Expected: existing suite plus Search Profile domain/context tests pass.

---

### Task 2: User-owned Search Profile storage and lifecycle

**Files:**
- Create: `lib/services/storage/migrations/sql/8.search-profiles.js`
- Create: `lib/services/storage/searchProfileStorage.js`
- Create: `lib/services/searchProfiles/searchProfileLifecycleService.js`
- Test: `test/storage/searchProfileMigration.test.js`
- Test: `test/storage/searchProfileStorage.test.js`
- Test: `test/services/searchProfiles/searchProfileLifecycleService.test.js`
- Modify: `.github/workflows/arpa-foundation.yml`

**Interfaces:**
- Storage: `getById(id)`, `listByUser(userId)`, `upsert(profile)`, `remove(id)`.
- Lifecycle: `listProfiles({userId})`, `getProfile({userId, profileId})`, `saveProfile({userId, profileId?, ...fields})`, `removeProfile({userId, profileId})`.
- Lifecycle always validates through `createSearchProfile`; update ownership is preserved and cross-user IDs are rejected.

- [ ] **Step 1: Write migration/storage/lifecycle tests first**

Migration schema must include user FK, scalar search fields, JSON source/schedule columns and timestamps. Lifecycle tests prove create/update/list/delete and cross-user rejection.

- [ ] **Step 2: Run CI and verify RED**

Expected: only new migration/storage/lifecycle contracts fail.

- [ ] **Step 3: Implement migration and storage**

Use a `search_profiles` table keyed by text `id`, `user_id` FK with `ON DELETE CASCADE`, JSON text for `enabled_sources_json` and `schedule_json`, plus indexes on `user_id` and `(user_id, updated_at)`.

- [ ] **Step 4: Implement lifecycle ownership and validation**

Generate IDs with `nanoid`, preserve original `createdAt`, set `updatedAt` from injected `now`, and never allow an existing profile to change owners.

- [ ] **Step 5: Run CI and verify GREEN**

---

### Task 3: Authenticated Search Profiles API

**Files:**
- Create: `lib/api/routes/searchProfileRouter.js`
- Modify: `lib/api/api.js`
- Test: `test/api/searchProfileRouter.test.js`
- Test: `test/api/searchProfileApiRegistration.test.js`
- Modify: `.github/workflows/arpa-foundation.yml`

**Interfaces:**
- `GET /api/searchProfiles` -> current user's profiles.
- `POST /api/searchProfiles` body `{profileId?, name, city, region, maxPrice, minBedrooms, minBathrooms, enabledSources, schedule}` -> created/updated profile.
- `DELETE /api/searchProfiles/:profileId` -> `{deleted:true,id}`.
- `GET /api/searchProfiles/:profileId/execution-context` -> `createProfileExecutionContext(profile)` for deterministic provider-run handoff.

- [ ] **Step 1: Write failing handler/error/auth registration tests**

Tests prove session ownership is used, validation failures return `400/422` without leaking internals, ownership/not-found are typed, and the router is mounted behind `authInterceptor()`.

- [ ] **Step 2: Run CI and verify RED**

- [ ] **Step 3: Implement handlers and HTTP error mapping**

Keep storage out of route handlers; call lifecycle/context services only.

- [ ] **Step 4: Register `/api/searchProfiles` behind auth**

- [ ] **Step 5: Run CI and verify GREEN**

---

### Task 4: Search Profiles UI

**Files:**
- Create: `ui/src/services/searchProfiles.js`
- Create: `ui/src/views/searchProfiles/searchProfileModel.js`
- Create: `ui/src/views/searchProfiles/SearchProfiles.jsx`
- Create: `ui/src/views/searchProfiles/SearchProfiles.less`
- Modify: `ui/src/App.jsx`
- Modify: `ui/src/components/navigation/Navigation.jsx`
- Test: `test/ui/searchProfileModel.test.js`
- Test: `test/ui/searchProfilesUiContract.test.js`
- Modify: `.github/workflows/arpa-foundation.yml`

**Interfaces:**
- UI model converts form state to API payload and stored profile to form state.
- Source choices combine dedicated `realtor-ca` with enabled Custom Sources returned from `/api/sources`.
- Page supports create/edit/delete and explicitly shows schedule interval; it does not claim the schedule is already wired to automatic execution.

- [ ] **Step 1: Write failing UI model and integration contracts**

Prove Ottawa defaults, numeric/null conversion, source-ref conversion, route/nav wiring and API paths.

- [ ] **Step 2: Run CI and verify RED**

- [ ] **Step 3: Implement frontend API/model**

- [ ] **Step 4: Implement ARPA Search Profiles workspace**

The editor contains name, city, region, max rent, min beds, min baths, source selection and schedule enabled/interval controls. Show `Realtor.ca` as a dedicated source and only user-owned Custom Sources returned by the existing Sources API.

- [ ] **Step 5: Wire `/searchProfiles` route and navigation**

- [ ] **Step 6: Run lint, production frontend build and deterministic tests until GREEN**

---

### Task 5: Integration review and merge gate

**Files:**
- Modify only files required by review findings.
- Update workboard #15 after merge.

**Interfaces:**
- Search Profile persisted representation, API representation and provider execution context use identical field names and source-ref semantics.

- [ ] **Step 1: Self-review profile validation, ownership, migration, API and UI state**

Check especially cross-user IDs, duplicate source refs, schedule bounds, numeric empty-field handling and unsaved edits.

- [ ] **Step 2: Run fresh current-head branch verification**

Required: install, lint, production frontend build and deterministic suite successful.

- [ ] **Step 3: Open PR to current `main` and review the actual diff**

- [ ] **Step 4: Require fresh pull-request CI against current `main`**

- [ ] **Step 5: Merge with expected-head SHA guard only after GREEN**

- [ ] **Step 6: Verify post-merge `main` CI and mark Notion #15 Done with RED/GREEN/PR evidence**
