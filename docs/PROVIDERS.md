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
lib/clients/realtor/errors.js
lib/domain/listing/canonicalListing.js
```

## Adapter boundary

New ARPA providers are stateless objects with stable `id`/`name`, optional fixed `domains`, required `discover` and `normalize` methods, and optional `fetchDetails` / `healthCheck` capabilities. Search profiles and source-specific configuration are passed into operations rather than stored through mutable module-level `init()` calls.

Fixed domains are used only for URL auto-resolution. They are intentionally optional: Realtor.ca can declare `realtor.ca`, while the generic Custom Source provider can target arbitrary user-configured domains without pretending to own them globally.

`discover` returns source-native records. `normalize` maps one source-native record into Canonical Listing v1. Raw source payload is retained by the canonical representation.

Generic Custom Source v1 supports a listing container plus selectors for title, price, URL, image, bedrooms, bathrooms and address. Static mode uses HTTP + Cheerio; dynamic mode uses the existing Puppeteer stack.

Every new dedicated provider requires deterministic source identity, bounded pagination/concurrency, explicit errors, offline fixtures, and no anti-bot/challenge bypass logic.
