# Provider strategy

## M1 sources

1. Realtor.ca — dedicated Canadian provider
2. Generic Custom Source — user-configurable static/browser extraction

Realtor transport and canonical mapping remain separate.

Present in the provider-core work:

```text
lib/providers/core/providerContract.js
lib/providers/core/ProviderRegistry.js
lib/domain/listing/canonicalListing.js
```

Planned/implemented by subsequent M1 provider tasks rather than this core PR:

```text
lib/providers/adapters/realtor-ca.js
lib/providers/adapters/custom-source.js
lib/providers/custom-source/recipe.js
lib/clients/realtor/client.js
lib/clients/realtor/browserTransport.js
lib/clients/realtor/errors.js
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

## Realtor.ca adapter

`lib/providers/adapters/realtor-ca.js` is the only layer that knows Realtor.ca field names. `discover()` maps Search Profile v1 (`city`, `region`, `maxPrice`, `minBedrooms`, `minBathrooms`) plus provider-specific source overrides into `RealtorClient.searchRentals()` and returns source-native records. `normalize()` converts exactly one source-native record into Canonical Listing v1.

Canonical source identity prefers Realtor's property `Id`; `MlsNumber` is only a fallback. Mutable fields such as price, description or bedroom count therefore do not create a new ARPA listing identity. Current mapping covers `Property.Price`, `Property.Address.AddressText`, coordinates, `Building.Bedrooms`, `Building.BathroomTotal`, `RelativeDetailsURL`, `Property.Photo` and `PublicRemarks`; the original source record is retained in `raw`.

Realtor-specific formatting is resolved inside the adapter: monthly price strings become numeric CAD values, address pipe separators become a normalized display address, and bedroom strings such as `2 + 1` become a total bedroom count. Provider-independent consumers receive only Canonical Listing fields.

## Generic Custom Source

`lib/providers/custom-source/recipe.js` defines the shared, strict Custom Source Recipe v1 contract consumed by the static extractor, browser extractor and Source Builder. Recipes are validated and normalized before activation; unknown keys are rejected so misspelled or unsupported configuration cannot silently change scraper behavior.

Recipe v1 requires `version: 1`, `mode: static|browser`, a public absolute HTTP(S) source `url`, and selectors for `listing`, `title`, `price` and `url`. Optional selectors are `image`, `beds`, `baths` and `address`. Selector strings are bounded and trimmed. Arbitrary request headers, cookies and credentials are intentionally not part of v1.

Pagination supports only `none` and `next-button`. Disabled pagination is exactly one page. `next-button` requires a selector and uses a bounded `maxPages` value of 1–10, defaulting to 5. Browser mode supports only bounded navigation controls: `waitUntil` is one of Puppeteer's `load`, `domcontentloaded`, `networkidle0` or `networkidle2`; timeout is 1–30 seconds; and an optional `waitForSelector` may be provided. Static recipes reject browser-only options.

Activation-time URL validation rejects non-HTTP(S) URLs, embedded credentials, localhost names, and literal private, loopback, link-local or IPv4-mapped IPv6 addresses. This is intentionally only the configuration-time boundary: #12/#13 network transports must also enforce public resolved addresses and redirects at request time so DNS resolution or redirect changes cannot turn an approved hostname into a private-network target.

Static mode will use HTTP + Cheerio; browser mode will use the existing Puppeteer stack. Every new dedicated provider requires deterministic source identity, bounded pagination/concurrency, explicit errors, offline fixtures, and no anti-bot/challenge bypass logic.
