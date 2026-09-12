# ARPA Map Integration — Implementation Plan

## Goal
Add a synchronized canonical listing map without copying post-license Fredy code.

## Dependencies
- MapLibre GL JS runtime pinned to 6.9.0 from unpkg.
- OpenFreeMap Liberty style: https://tiles.openfreemap.org/styles/liberty.
- No API key is required.
- Only canonical listings with valid latitude/longitude are plotted.

## Architecture
1. Pure map model:
   - project canonical feed rows into geocoded points;
   - reject invalid/out-of-range coordinates;
   - Ottawa default center.
2. Runtime loader:
   - load pinned MapLibre JS/CSS once;
   - fail visibly if CDN loading fails.
3. ListingMap component:
   - initialize one map instance;
   - render ARPA-owned DOM markers;
   - fit geocoded listings;
   - marker click selects listing;
   - selected listing focuses marker/location.
4. Listings workspace:
   - shared selectedListingId state;
   - card click/keyboard selection focuses map;
   - marker selection scrolls corresponding card into view;
   - un-geocoded listings remain visible in the list.

## Non-goals
- Geocoding missing Custom Source addresses (#19/deployment enrichment).
- Marker clustering / property dedup (M2).
- Polygon search/drawing.
- Commute overlays (M4).

## Acceptance
- Geocoded canonical listings render on MapLibre.
- Card selection focuses its marker.
- Marker selection focuses and scrolls its listing card.
- Missing/invalid coordinates never crash the map or hide the listing from the list.
- Ottawa is the empty/default viewport.
