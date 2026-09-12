import SqliteConnection from './SqliteConnection.js';

const toJson = (value) => (value == null ? null : JSON.stringify(value));
const fromJson = (value, fallback = null) => {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const mapCanonicalRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    providerId: row.provider_id,
    sourceListingId: row.source_listing_id,
    url: row.url,
    title: row.title ?? null,
    price: row.price ?? null,
    currency: row.currency ?? null,
    beds: row.beds ?? null,
    baths: row.baths ?? null,
    address: row.address ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    imageUrl: row.image_url ?? null,
    description: row.description ?? null,
    raw: fromJson(row.raw_json),
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  };
};

const canonicalSelect = `
  id, provider_id, source_listing_id, url, title, price, currency,
  beds, baths, address, latitude, longitude, image_url, description,
  raw_json, first_seen, last_seen
`;

export const getCanonicalListingById = (id) =>
  mapCanonicalRow(
    SqliteConnection.query(
      `SELECT ${canonicalSelect} FROM canonical_listings WHERE id = @id LIMIT 1`,
      { id },
    )[0],
  );

export const upsertCanonicalListing = (listing) => {
  SqliteConnection.execute(
    `INSERT INTO canonical_listings (
       id, provider_id, source_listing_id, url, title, price, currency,
       beds, baths, address, latitude, longitude, image_url, description,
       raw_json, first_seen, last_seen
     ) VALUES (
       @id, @providerId, @sourceListingId, @url, @title, @price, @currency,
       @beds, @baths, @address, @latitude, @longitude, @imageUrl, @description,
       @rawJson, @firstSeen, @lastSeen
     )
     ON CONFLICT(id) DO UPDATE SET
       url = excluded.url,
       title = COALESCE(excluded.title, canonical_listings.title),
       price = COALESCE(excluded.price, canonical_listings.price),
       currency = COALESCE(excluded.currency, canonical_listings.currency),
       beds = COALESCE(excluded.beds, canonical_listings.beds),
       baths = COALESCE(excluded.baths, canonical_listings.baths),
       address = COALESCE(excluded.address, canonical_listings.address),
       latitude = COALESCE(excluded.latitude, canonical_listings.latitude),
       longitude = COALESCE(excluded.longitude, canonical_listings.longitude),
       image_url = COALESCE(excluded.image_url, canonical_listings.image_url),
       description = COALESCE(excluded.description, canonical_listings.description),
       raw_json = COALESCE(excluded.raw_json, canonical_listings.raw_json),
       first_seen = MIN(canonical_listings.first_seen, excluded.first_seen),
       last_seen = MAX(canonical_listings.last_seen, excluded.last_seen)`,
    {
      id: listing.id,
      providerId: listing.providerId,
      sourceListingId: listing.sourceListingId,
      url: listing.url,
      title: listing.title ?? null,
      price: listing.price ?? null,
      currency: listing.currency ?? null,
      beds: listing.beds ?? null,
      baths: listing.baths ?? null,
      address: listing.address ?? null,
      latitude: listing.latitude ?? null,
      longitude: listing.longitude ?? null,
      imageUrl: listing.imageUrl ?? null,
      description: listing.description ?? null,
      rawJson: toJson(listing.raw),
      firstSeen: listing.firstSeen,
      lastSeen: listing.lastSeen,
    },
  );

  return getCanonicalListingById(listing.id);
};

export const upsertProfileHit = ({
  profileId,
  listingId,
  sourceKind,
  sourceId,
  sourceLabel,
  seenAt,
}) => {
  SqliteConnection.execute(
    `INSERT INTO search_profile_listing_hits (
       profile_id, listing_id, source_kind, source_id, source_label, first_seen, last_seen
     ) VALUES (
       @profileId, @listingId, @sourceKind, @sourceId, @sourceLabel, @seenAt, @seenAt
     )
     ON CONFLICT(profile_id, listing_id) DO UPDATE SET
       source_kind = excluded.source_kind,
       source_id = excluded.source_id,
       source_label = excluded.source_label,
       first_seen = MIN(search_profile_listing_hits.first_seen, excluded.first_seen),
       last_seen = MAX(search_profile_listing_hits.last_seen, excluded.last_seen)`,
    { profileId, listingId, sourceKind, sourceId, sourceLabel, seenAt },
  );

  return SqliteConnection.query(
    `SELECT profile_id, listing_id, source_kind, source_id, source_label, first_seen, last_seen
       FROM search_profile_listing_hits
      WHERE profile_id = @profileId AND listing_id = @listingId
      LIMIT 1`,
    { profileId, listingId },
  )[0] ?? null;
};

const SORTS = Object.freeze({
  newest: 'h.first_seen DESC, l.id ASC',
  'price-asc': '(l.price IS NULL) ASC, l.price ASC, h.first_seen DESC, l.id ASC',
  'price-desc': '(l.price IS NULL) ASC, l.price DESC, h.first_seen DESC, l.id ASC',
});

const mapFeedRow = (row) => ({
  profileId: row.profile_id,
  listingId: row.listing_id,
  sourceKind: row.source_kind,
  sourceId: row.source_id,
  sourceLabel: row.source_label,
  id: row.listing_id,
  providerId: row.provider_id,
  sourceListingId: row.source_listing_id,
  url: row.url,
  title: row.title ?? null,
  price: row.price ?? null,
  currency: row.currency ?? null,
  beds: row.beds ?? null,
  baths: row.baths ?? null,
  address: row.address ?? null,
  latitude: row.latitude ?? null,
  longitude: row.longitude ?? null,
  imageUrl: row.image_url ?? null,
  description: row.description ?? null,
  raw: fromJson(row.raw_json),
  firstSeen: row.hit_first_seen,
  lastSeen: row.hit_last_seen,
});

export const queryProfileFeed = ({ profileId, sort = 'newest' } = {}) => {
  const orderBy = SORTS[sort];
  if (!orderBy) throw new TypeError('sort must be one of: newest, price-asc, price-desc');

  return SqliteConnection.query(
    `SELECT
       h.profile_id,
       h.listing_id,
       h.source_kind,
       h.source_id,
       h.source_label,
       h.first_seen AS hit_first_seen,
       h.last_seen AS hit_last_seen,
       l.provider_id,
       l.source_listing_id,
       l.url,
       l.title,
       l.price,
       l.currency,
       l.beds,
       l.baths,
       l.address,
       l.latitude,
       l.longitude,
       l.image_url,
       l.description,
       l.raw_json
     FROM search_profile_listing_hits h
     JOIN canonical_listings l ON l.id = h.listing_id
     WHERE h.profile_id = @profileId
     ORDER BY ${orderBy}`,
    { profileId },
  ).map(mapFeedRow);
};
