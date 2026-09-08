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
lib/provider/realtor-ca.js
lib/provider/generic/*
lib/clients/realtor/*
lib/normalization/*
lib/filtering/*
lib/scoring/*
lib/dedup/*
```

The old baseline provider modules mutate shared module configuration during `init()`. New ARPA provider work must not repeat that pattern. M1 includes introducing a stateless per-run adapter boundary before running Canadian providers concurrently.

Modern capabilities that did not exist in the MIT baseline (for example MapLibre/MCP/newer server architecture) should be implemented independently when their milestone requires them.
