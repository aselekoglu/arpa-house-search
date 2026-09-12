export const OTTAWA_MAP_CENTER = Object.freeze([-75.6972, 45.4215]);
export const OTTAWA_MAP_ZOOM = 10.5;

const canonicalId = (listing) => listing?.listingId ?? listing?.id ?? null;

const hasValidCoordinates = (listing) =>
  Number.isFinite(listing?.latitude) &&
  Number.isFinite(listing?.longitude) &&
  listing.latitude >= -90 &&
  listing.latitude <= 90 &&
  listing.longitude >= -180 &&
  listing.longitude <= 180;

export const geocodedListings = (listings) => {
  if (!Array.isArray(listings)) return [];
  return listings
    .filter(hasValidCoordinates)
    .map((listing) => ({ ...listing }));
};

export const selectedGeocodedListing = (listings, selectedListingId) => {
  if (typeof selectedListingId !== 'string' || selectedListingId.length === 0) return null;
  return (
    geocodedListings(listings).find(
      (listing) => canonicalId(listing) === selectedListingId,
    ) ?? null
  );
};

export const listingCanonicalId = canonicalId;
