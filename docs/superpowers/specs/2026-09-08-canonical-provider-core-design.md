# Canonical Listing + Provider Core Design

## Scope

This design implements M1 workboard tasks #6 (Canonical Listing v1) and #7 (Provider Registry). It intentionally does not implement Realtor.ca transport, Custom Source recipes, persistence migrations, scheduler integration, or UI changes.

## Goals

- Give every provider one provider-agnostic listing representation.
- Keep provider configuration request-scoped; no module-level mutable `init()` state in new ARPA providers.
- Make provider discovery, normalization, details, and health-check capabilities explicit.
- Resolve a provider by stable id or known URL/domain without UI logic.
- Preserve raw provider payloads so normalization can evolve independently from crawling.

## Canonical Listing v1

A canonical listing is a plain object with these fields:

```js
{
  id,                 // stable ARPA id derived from providerId + sourceListingId
  providerId,         // stable registry id, e.g. "realtor-ca"
  sourceListingId,    // provider-native listing identity as a string
  url,                // absolute listing URL
  title,              // string|null
  price,              // finite number|null
  currency,           // ISO-like uppercase code|null, e.g. "CAD"
  beds,               // finite number|null
  baths,              // finite number|null
  address,             // formatted address string|null
  latitude,            // finite number|null
  longitude,           // finite number|null
  imageUrl,            // absolute/relative provider image URL|string|null
  description,         // string|null
  firstSeen,           // epoch milliseconds
  lastSeen,            // epoch milliseconds; >= firstSeen
  raw                  // provider payload or null
}
```

Required source identity fields are `providerId`, `sourceListingId`, and `url`. The canonical `id` is deterministic and does not include mutable listing fields such as price, so a price change does not create a new home.

The constructor/normalizer is responsible for safe scalar coercion, default timestamps, coordinate range validation, and a defensive clone of JSON-compatible `raw` data. Invalid required identity or invalid timestamps throw a `CanonicalListingError` before the listing reaches storage.

## Provider Adapter Contract

A new ARPA provider adapter is a stateless object:

```js
{
  id: 'realtor-ca',
  name: 'Realtor.ca',
  domains: ['realtor.ca'],
  capabilities: {
    discover: true,
    normalize: true,
    fetchDetails: false,
    healthCheck: true,
  },

  async discover({ profile, sourceConfig, signal }) {},
  normalize(rawListing, { now, profile, sourceConfig } = {}) {},
  async fetchDetails?(sourceListing, context) {},
  async healthCheck?({ signal } = {}) {},
}
```

No adapter receives configuration through mutable module state. Search profile and source configuration are passed to every operation that needs them.

`discover` returns provider-native records. `normalize` maps exactly one provider-native record to Canonical Listing v1. This separation keeps transport failures and mapping failures independently testable.

## Provider Registry

`ProviderRegistry` owns adapter registration and lookup, not crawling. It:

- validates the adapter contract at registration time;
- rejects duplicate ids and duplicate normalized domain ownership;
- returns adapters by id;
- resolves `https://...` URLs by hostname, including subdomains of registered domains;
- reports adapter metadata/capabilities without exposing implementation internals;
- runs health checks and converts thrown errors into structured unhealthy results;
- can load a list of adapter modules/objects without depending on frontend code.

The registry must not special-case `realtor-ca`, `custom-source`, or any future provider id.

## Legacy Boundary

The existing MIT Fredy providers under `lib/provider/` remain untouched in this task. New ARPA providers live under `lib/providers/adapters/` and use the new contract. A later compatibility task may wrap legacy providers if retaining them has product value; new core code must not depend on their mutable `init()` convention.

## Error Handling

- Canonical listing validation errors identify the invalid field.
- Provider registration fails synchronously for malformed adapters.
- Unknown ids/URLs resolve to `null`, not an exception.
- A health-check exception is returned as `{ healthy: false, error }` and does not abort checks for other providers.

## Testing

Unit tests cover:

1. canonical stable identity and scalar normalization;
2. timestamp defaults and invalid timestamp ordering;
3. raw payload defensive copy;
4. adapter contract validation;
5. duplicate id/domain rejection;
6. id and URL/domain resolution;
7. capability metadata;
8. health-check isolation.

The M1 branch must continue to pass the existing deterministic foundation suite, lint, and frontend build.