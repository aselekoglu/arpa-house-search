import { createSearchProfile } from '../../domain/search/searchProfile.js';

export const createProfileExecutionContext = (inputProfile) => {
  const profile = createSearchProfile(inputProfile);

  const providerProfile = Object.freeze({
    id: profile.id,
    name: profile.name,
    city: profile.city,
    region: profile.region,
    maxPrice: profile.maxPrice,
    minBedrooms: profile.minBedrooms,
    minBathrooms: profile.minBathrooms,
  });

  const enabledSources = Object.freeze(
    profile.enabledSources.map((source) => Object.freeze({ ...source })),
  );
  const schedule = Object.freeze({ ...profile.schedule });

  return Object.freeze({
    profile: providerProfile,
    enabledSources,
    schedule,
  });
};
