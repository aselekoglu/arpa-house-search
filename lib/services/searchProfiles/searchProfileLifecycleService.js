import { nanoid } from 'nanoid';
import { createSearchProfile } from '../../domain/search/searchProfile.js';

export class SearchProfileOwnershipError extends Error {
  constructor(message = 'Search Profile does not belong to the current user') {
    super(message);
    this.name = 'SearchProfileOwnershipError';
  }
}

export class SearchProfileNotFoundError extends Error {
  constructor(message = 'Search Profile was not found') {
    super(message);
    this.name = 'SearchProfileNotFoundError';
  }
}

const requiredUserId = (userId) => {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new TypeError('userId is required');
  }
  return userId.trim();
};

const present = (profile) => createSearchProfile(profile);

export const createSearchProfileLifecycleService = ({
  storage,
  idFactory = nanoid,
  now = Date.now,
} = {}) => {
  if (
    storage == null ||
    typeof storage.getById !== 'function' ||
    typeof storage.listByUser !== 'function' ||
    typeof storage.upsert !== 'function' ||
    typeof storage.remove !== 'function'
  ) {
    throw new TypeError('storage must implement the Search Profile storage contract');
  }
  if (typeof idFactory !== 'function') throw new TypeError('idFactory must be a function');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const ownedProfile = (userId, profileId) => {
    const ownerId = requiredUserId(userId);
    if (typeof profileId !== 'string' || profileId.trim().length === 0) {
      throw new TypeError('profileId is required');
    }
    const profile = storage.getById(profileId.trim());
    if (!profile) throw new SearchProfileNotFoundError();
    if (profile.userId !== ownerId) throw new SearchProfileOwnershipError();
    return profile;
  };

  return Object.freeze({
    listProfiles({ userId }) {
      const ownerId = requiredUserId(userId);
      return storage.listByUser(ownerId).map(present);
    },

    getProfile({ userId, profileId }) {
      return present(ownedProfile(userId, profileId));
    },

    saveProfile({
      userId,
      profileId = null,
      name,
      city,
      region,
      maxPrice,
      minBedrooms,
      minBathrooms,
      enabledSources,
      schedule,
    }) {
      const ownerId = requiredUserId(userId);
      const existing = profileId == null ? null : ownedProfile(ownerId, profileId);
      const timestamp = now();

      const profile = createSearchProfile({
        id: existing?.id ?? profileId ?? idFactory(),
        userId: existing?.userId ?? ownerId,
        name,
        city,
        region,
        maxPrice,
        minBedrooms,
        minBathrooms,
        enabledSources,
        schedule,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });

      return present(storage.upsert(profile));
    },

    removeProfile({ userId, profileId }) {
      const profile = ownedProfile(userId, profileId);
      storage.remove(profile.id);
    },
  });
};
