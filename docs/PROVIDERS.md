# Provider strategy

## M1 sources

1. Realtor.ca — dedicated Canadian provider
2. Generic Custom Source — user-configurable static/browser extraction

Realtor transport and canonical mapping remain separate.

```text
lib/provider/realtor-ca.js
lib/clients/realtor/client.js
lib/clients/realtor/mapper.js
lib/clients/realtor/errors.js
```

Generic Custom Source v1 supports a listing container plus selectors for title, price, URL, image, bedrooms, bathrooms and address. Static mode uses HTTP + Cheerio; dynamic mode uses the existing Puppeteer stack.

Every new dedicated provider requires deterministic source identity, bounded pagination/concurrency, explicit errors, and offline fixtures.
