import { createCanonicalListing } from '../../domain/listing/canonicalListing.js';
import { RealtorBrowserTransport, RealtorClient } from '../../clients/realtor/index.js';

const SITE_URL = 'https://www.realtor.ca';

const text = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
};

const finiteNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = text(value);
  if (normalized == null) return null;
  const match = normalized.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0].replaceAll(',', ''));
  return Number.isFinite(number) ? number : null;
};

const bedroomCount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = text(value);
  if (normalized == null) return null;
  const matches = normalized.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  return matches.reduce((sum, part) => sum + Number(part), 0);
};

const normalizedAddress = (rawAddress) => {
  const value = text(rawAddress);
  if (value == null) return { title: null, address: null };
  const parts = value
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    title: parts[0] ?? value,
    address: parts.length > 1 ? parts.join(', ') : value,
  };
};

const detailUrl = (raw) => {
  const candidate = text(raw?.RelativeDetailsURL);
  if (candidate != null) {
    try {
      return new URL(candidate, `${SITE_URL}/`).toString();
    } catch {
      return candidate;
    }
  }

  const id = text(raw?.Id);
  return id == null ? null : `${SITE_URL}/real-estate/${encodeURIComponent(id)}`;
};

const imageUrl = (raw) => {
  const photos = raw?.Property?.Photo;
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const photo = photos[0] || {};
  return text(photo.HighResPath) ?? text(photo.MedResPath) ?? text(photo.LowResPath) ?? null;
};

const searchArea = (profile = {}, sourceConfig = {}) => {
  const explicitArea = text(sourceConfig.area);
  if (explicitArea != null) return explicitArea;

  const city = text(profile.city);
  const region = text(profile.region);
  return [city, region].filter(Boolean).join(', ');
};

export const normalizeRealtorListing = (raw, { now = Date.now() } = {}) => {
  const property = raw?.Property || {};
  const building = raw?.Building || {};
  const propertyAddress = property.Address || {};
  const address = normalizedAddress(propertyAddress.AddressText);

  return createCanonicalListing(
    {
      providerId: 'realtor-ca',
      sourceListingId: raw?.Id ?? raw?.MlsNumber,
      url: detailUrl(raw),
      title: address.title,
      price: finiteNumber(property.Price),
      currency: 'CAD',
      beds: bedroomCount(building.Bedrooms),
      baths: finiteNumber(building.BathroomTotal),
      address: address.address,
      latitude: finiteNumber(propertyAddress.Latitude ?? property.Latitude),
      longitude: finiteNumber(propertyAddress.Longitude ?? property.Longitude),
      imageUrl: imageUrl(raw),
      description: text(raw?.PublicRemarks),
      raw,
    },
    { now },
  );
};

export const createRealtorCaAdapter = ({ client = null, browserTransportOptions = {} } = {}) => {
  const realtorClient =
    client ??
    new RealtorClient({
      transport: new RealtorBrowserTransport(browserTransportOptions),
    });

  return Object.freeze({
    id: 'realtor-ca',
    name: 'Realtor.ca',
    domains: Object.freeze(['realtor.ca']),

    async discover({ profile = {}, sourceConfig = {} } = {}) {
      const result = await realtorClient.searchRentals({
        area: searchArea(profile, sourceConfig),
        minPrice: sourceConfig.minPrice,
        maxPrice: sourceConfig.maxPrice ?? profile.maxPrice,
        minBeds: sourceConfig.minBedrooms ?? profile.minBedrooms,
        minBaths: sourceConfig.minBathrooms ?? profile.minBathrooms,
        maxPages: sourceConfig.maxPages ?? 3,
        recordsPerPage: sourceConfig.recordsPerPage ?? 20,
      });
      return result.results;
    },

    normalize(rawListing, context = {}) {
      return normalizeRealtorListing(rawListing, context);
    },
  });
};
