# Provider strategy

## M1 sources

1. Realtor.ca — dedicated Canadian provider
2. Generic Custom Source — user-configurable static/browser extraction

Realtor transport and canonical mapping remain separate.

```text
lib/providers/core/providerContract.js
lib/providers/core/ProviderRegistry.js
lib/providers/adapters/realtor-ca.js
lib/providers/adapters/custom-source.js
lib/clients/realtor/client.js
lib/clients/realtor/browserTransport.js
lib/clients/realtor/errors.js
lib/domain/listing/canonicalListing.js
```

## Adapter boundary

New ARPA providers are stateless objects with stable `id`/`name`, optional fixed `domains`, required `discover` and `normalize` methods, and optional `fetchDetails` / `healthCheck` capabilities. Search profiles and source-specific configuration are passed into operations rather than stored through mutable module-level `init()` calls.

Fixed domains are used only for URL auto-resolution. They are intentionally optional: Realtor.ca can declare `realtor.ca`, while the generic Custom Source provider can target arbitrary user-configured domains without pretending to own them globally.

`discover` returns source-native records. `normalize` maps one source-native record into Canonical Listing v1. Raw source payload is retained by the canonical representation.

## Realtor.ca transport

ARPA does not assume access to CREA's credentialed DDF feed. The personal-search path uses a persistent, ordinary Puppeteer browser profile and keeps browser/session concerns inside `lib/clients/realtor/browserTransport.js`.

The client first resolves an area through `Location.svc/SubAreaSearch`, then uses the consumer site's current `Listing.svc/AsyncPropertySearch_Post` endpoint from the loaded `www.realtor.ca` browser context. Rental discovery uses transaction type `3`, CAD pricing, newest-first sorting, bounded pagination, and the location viewport/GEO id returned by Realtor.ca.

The transport deliberately does not implement stealth, CAPTCHA solving, challenge token generation, or WAF bypass logic. A browser challenge or rejected session becomes an explicit `RealtorChallengeError`; malformed upstream payloads and transport failures are separate typed errors. The persistent profile lives under `db/browser/` by default and is gitignored because it may contain session state.

Live network access is not part of deterministic CI. Realtor client tests use offline synthetic responses and an injected Puppeteer-compatible browser double. A manual/live probe can be run from the deployment environment when validating current Realtor.ca behavior.

## Generic Custom Source

Generic Custom Source v1 supports a listing container plus selectors for title, price, URL, image, bedrooms, bathrooms and address. Static mode uses HTTP + Cheerio; dynamic mode uses the existing Puppeteer stack.

Every new dedicated provider requires deterministic source identity, bounded pagination/concurrency, explicit errors, offline fixtures, and no anti-bot/challenge bypass logic.
