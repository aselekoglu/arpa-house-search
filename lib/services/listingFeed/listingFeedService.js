import { createCanonicalListing } from '../../domain/listing/canonicalListing.js';

const SORTS = new Set(['newest', 'price-asc', 'price-desc']);

export class ListingFeedAccessError extends Error {
  constructor(message = 'Search Profile is not available to the current user') {
    super(message);
    this.name = 'ListingFeedAccessError';
  }
}

export class ListingFeedSourceError extends Error {
  constructor(message = 'Source is not available for this Search Profile') {
    super(message);
    this.name = 'ListingFeedSourceError';
  }
}

const requiredText = (value, field) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} is required`);
  }
  return value.trim();
};

const validateStorage = (storage) => {
  if (
    storage == null ||
    typeof storage.upsertCanonicalListing !== 'function' ||
    typeof storage.upsertProfileHit !== 'function' ||
    typeof storage.queryProfileFeed !== 'function'
  ) {
    throw new TypeError('storage must implement the Listing Feed storage contract');
  }
  return storage;
};

const providerLabel = (providerId) =>
  providerId === 'realtor-ca' ? 'Realtor.ca' : providerId;

export const createListingFeedService = ({
  storage,
  searchProfileStorage,
  customSourceStorage,
} = {}) => {
  const feedStorage = validateStorage(storage);
  if (searchProfileStorage == null || typeof searchProfileStorage.getById !== 'function') {
    throw new TypeError('searchProfileStorage must expose getById(id)');
  }
  if (customSourceStorage == null || typeof customSourceStorage.getById !== 'function') {
    throw new TypeError('customSourceStorage must expose getById(id)');
  }

  const ownedProfile = (userId, profileId) => {
    const ownerId = requiredText(userId, 'userId');
    const id = requiredText(profileId, 'profileId');
    const profile = searchProfileStorage.getById(id);
    if (!profile || profile.userId !== ownerId) throw new ListingFeedAccessError();
    return profile;
  };

  const resolveSource = (profile, source) => {
    if (source == null || typeof source !== 'object' || Array.isArray(source)) {
      throw new TypeError('source must be an object');
    }
    const kind = requiredText(source.kind, 'source.kind');
    const id = requiredText(source.id, 'source.id');

    const enabled = Array.isArray(profile.enabledSources) &&
      profile.enabledSources.some((candidate) => candidate.kind === kind && candidate.id === id);
    if (!enabled) throw new ListingFeedSourceError();

    if (kind === 'provider') {
      return {
        kind,
        id,
        providerId: id,
        label: providerLabel(id),
      };
    }

    if (kind === 'custom-source') {
      const customSource = customSourceStorage.getById(id);
      if (!customSource || customSource.userId !== profile.userId || customSource.enabled !== true) {
        throw new ListingFeedSourceError();
      }
      return {
        kind,
        id,
        providerId: `custom-source:${id}`,
        label:
          typeof customSource.name === 'string' && customSource.name.trim().length > 0
            ? customSource.name.trim()
            : id,
      };
    }

    throw new ListingFeedSourceError('Unsupported source kind');
  };

  return Object.freeze({
    ingest({ userId, profileId, source, listings, seenAt = Date.now() } = {}) {
      const profile = ownedProfile(userId, profileId);
      const resolvedSource = resolveSource(profile, source);
      if (!Array.isArray(listings)) throw new TypeError('listings must be an array');
      if (!Number.isFinite(seenAt) || seenAt < 0) {
        throw new TypeError('seenAt must be a non-negative epoch timestamp');
      }

      let ingested = 0;
      for (const input of listings) {
        const listing = createCanonicalListing(input);
        if (listing.providerId !== resolvedSource.providerId) {
          throw new ListingFeedSourceError('Listing provider identity does not match the selected source');
        }

        const stored = feedStorage.upsertCanonicalListing(listing);
        feedStorage.upsertProfileHit({
          profileId: profile.id,
          listingId: stored.id,
          sourceKind: resolvedSource.kind,
          sourceId: resolvedSource.id,
          sourceLabel: resolvedSource.label,
          seenAt,
        });
        ingested += 1;
      }

      return { ingested };
    },

    query({ userId, profileId, sort = 'newest' } = {}) {
      const profile = ownedProfile(userId, profileId);
      if (!SORTS.has(sort)) {
        throw new TypeError('sort must be one of: newest, price-asc, price-desc');
      }
      return feedStorage.queryProfileFeed({ profileId: profile.id, sort });
    },
  });
};
