# Unified Listings Feed — Implementation Plan

## Goal
Deliver M1 task #16 without coupling ARPA's canonical rental model to Fredy's legacy job/listings table.

## Architecture
- Keep the inherited `listings` table and legacy table UI untouched internally.
- Persist normalized source listings in `canonical_listings`.
- Persist per-Search-Profile membership/freshness in `search_profile_listing_hits`.
- Treat `first_seen` on the hit as "new to this Search Profile" and preserve it across reruns.
- Advance `last_seen` on reruns.
- Store source kind/id/label on each hit so historical feed rows remain readable even if a Custom Source is renamed or removed later.
- User scoping always flows through Search Profile ownership.
- #18 will orchestrate discovery and call the ingest service; #16 only defines the stable ingest/query contract.

## Slice A — canonical ingest core
1. Custom Source record → Canonical Listing mapper.
2. Migration for canonical listings + profile hits.
3. Storage upsert/query layer.
4. Listing Feed service:
   - validate Search Profile ownership;
   - require source to be enabled on the profile;
   - require Custom Source ownership + enabled state;
   - reject listing/source identity mismatch;
   - ingest canonical rows and profile hits;
   - query newest / price ascending / price descending.

## Slice B — HTTP + ARPA feed UI
1. Authenticated listing-feed endpoint.
2. Frontend API client.
3. Feed model for money, source and freshness presentation.
4. ARPA-styled responsive listing cards.
5. Search Profile selector and newest/price sort controls.

## Explicit non-goals
- Scheduler/manual provider execution (#18).
- Map synchronization (#17).
- Cross-source property clustering/dedup (M2).
- Hard filters/scoring (M3).

## Acceptance
- Realtor.ca and Custom Source canonical listings can coexist in one profile feed.
- Cards expose photo, price, beds, baths, address, source and freshness.
- Rerunning an unchanged source does not reset profile first-seen time.
- Feed supports newest and price sorting.
- A user cannot read or ingest against another user's Search Profile or Custom Source.
