# M1 End-to-End Regression Plan

## Goal
Prove the Ottawa vertical slice as one deterministic, offline flow using the real M1 domain/storage/execution boundaries.

## Scenario
1. Create one user.
2. Persist an Ottawa Search Profile with Realtor.ca + one enabled Custom Source.
3. Persist the Custom Source recipe.
4. Execute the Search Profile manually.
5. Realtor fixture normalizes into Canonical Listing v1.
6. Static Custom Source fixture normalizes into Canonical Listing v1.
7. Both sources ingest into the same canonical feed.
8. Query the profile feed and verify both source identities.
9. Project geocoded results into the MapLibre model.
10. Execute the unchanged sources a second time.
11. Verify listing count stays stable, profile firstSeen is preserved, and lastSeen advances.

## Explicitly offline
- No live Realtor.ca request.
- No live Custom Source request.
- No geocoding network call.
- No browser launch.
- Fixture/provider/extractor boundaries are deterministic substitutes while the real normalization, persistence, execution, feed and map projection code runs.

## Acceptance
- One persisted Search Profile drives both source kinds.
- Run record reports both source outcomes.
- Canonical feed contains exactly two stable listings after rerun.
- firstSeen remains unchanged after rerun.
- lastSeen increases after rerun.
- Realtor fixture appears in the geocoded map projection.
