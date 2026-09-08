# Architecture

## Target pipeline

```text
Scheduler / Manual Run
  -> provider discovery
  -> raw listing
  -> canonical normalization
  -> freshness/source identity
  -> cheap enrichment
  -> hard filter (PASS / FAIL / UNKNOWN)
  -> detail / expensive enrichment
  -> cross-source matching
  -> explainable scoring
  -> persist
  -> notify
```

## Existing MIT-baseline infrastructure to retain initially

- job/scheduler infrastructure
- REST API/auth
- SQLite/migrations/storage
- notification adapters
- Puppeteer/Cheerio extraction
- similarity cache
- React/Vite/Zustand frontend

## ARPA additions

```text
lib/domain/listing/*
lib/providers/core/*
lib/providers/adapters/*
lib/clients/realtor/*
lib/filtering/*
lib/scoring/*
lib/dedup/*
```

Canonical listing representation is independent of provider transport and persistence. New ARPA provider adapters implement the stateless contract in `lib/providers/core/`: configuration is passed per operation instead of being written into module-level state.

The old MIT-baseline providers remain under `lib/provider/` and mutate shared module configuration during `init()`. New ARPA provider work must not repeat that pattern. Legacy providers may later be wrapped behind the ARPA contract if retaining them has product value, but the new core must not depend on their mutable convention.

Providers may declare fixed domains for URL auto-resolution (for example Realtor.ca), but fixed domains are optional so generic/config-driven providers can be selected explicitly by source configuration.

Modern capabilities that did not exist in the MIT baseline (for example MapLibre/MCP/newer server architecture) should be implemented independently when their milestone requires them.
