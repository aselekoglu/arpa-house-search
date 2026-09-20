# Private Vercel Deployment — Implementation Plan

## Goal
Deploy the completed M1 ARPA House Search to Vercel as a private, single-user production app while keeping the MIT/SQLite local mode intact.

## Production architecture
- Vercel stateless Node container (`Dockerfile.vercel`).
- Neon Postgres persistence via Neon's HTTP SQL endpoint using native `fetch` (no new npm driver dependency).
- Existing React/Vite UI served by the Node server.
- Production app surface: Login, Search Profiles, Sources, Listings + Map, Run Now.
- Legacy Fredy Jobs/Admin screens remain in the repository for local compatibility but are not bootstrapped or linked in the private production shell.
- Realtor.ca and browser Custom Sources run with Chromium inside the container.
- Manual Run Now uses the same production executor as scheduling.
- Vercel Cron triggers the scheduler once daily on Hobby. Search Profile interval semantics remain stored so higher-frequency cron can be enabled later without schema changes.

## Persistence
Production tables:
- users
- custom_sources
- search_profiles
- canonical_listings
- search_profile_listing_hits
- search_profile_runs
- search_profile_run_sources

Session cookies are signed using a key derived from DATABASE_URL. User passwords remain SHA-256 compatible with the inherited local login contract.

## Security
- Every data query is user scoped.
- Custom Source recipes keep SSRF protections from M1.
- Cron honors CRON_SECRET when configured; otherwise accepts only Vercel Cron user-agent and still performs due checks.
- No database credential is committed to Git.
- Deployment starts with one owner account; schema supports additional users later.

## Vercel constraints
- Local filesystem is treated as ephemeral.
- Puppeteer uses system Chromium installed in the container.
- Realtor browser profile uses /tmp and may encounter Realtor.ca challenge; source failures remain isolated and visible in run records.
- Hobby Cron runs daily; manual Run Now remains available at any time.

## Verification
- deterministic production adapter tests
- existing M1 E2E suite
- production frontend build
- Neon schema smoke check
- Vercel deployment build logs
- live login/API/UI smoke test
