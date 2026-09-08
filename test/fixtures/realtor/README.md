# Realtor.ca test fixtures

These files are synthetic/redacted offline fixtures for deterministic ARPA tests. They preserve the provider field shapes that the Realtor client and adapter consume without copying a complete live response or storing user/session data.

Coverage:

- `geocode-ottawa.json` — representative `SubAreaSearch` location/viewport response.
- `listing-normal.json` — normal rental record with price, address, coordinates, photos, beds/baths and remarks.
- `listing-missing-fields.json` — valid source identity and URL with optional coordinates/photos/bed/bath/remarks omitted.
- `search-page-1.json` / `search-page-2.json` — multi-page search results with a larger reported total to verify bounded pagination.
- `search-malformed.json` — intentionally malformed search response for typed error coverage.

Default CI must consume these files instead of calling the live Realtor.ca site. Live behavior is a separate explicit smoke test.
