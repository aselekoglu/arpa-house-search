import { createHash } from 'node:crypto';

export class CanonicalListingError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'CanonicalListingError';
    this.field = field;
  }
}

const requiredString = (value, field) => {
  if (value == null) {
    throw new CanonicalListingError(field, `${field} is required`);
  }

  const normalized = String(value).trim();
  if (normalized.length === 0) {
    throw new CanonicalListingError(field, `${field} is required`);
  }
  return normalized;
};

const nullableString = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
};

const nullableNumber = (value) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
};

const coordinate = (value, field, min, max) => {
  const normalized = nullableNumber(value);
  if (normalized == null) return null;
  if (normalized < min || normalized > max) {
    throw new CanonicalListingError(field, `${field} must be between ${min} and ${max}`);
  }
  return normalized;
};

const timestamp = (value, fallback, field) => {
  if (value == null) return fallback;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new CanonicalListingError(field, `${field} must be a non-negative epoch timestamp`);
  }
  return normalized;
};

const absoluteHttpUrl = (value) => {
  const normalized = requiredString(value, 'url');
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new CanonicalListingError('url', 'url must be an absolute HTTP(S) URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new CanonicalListingError('url', 'url must be an absolute HTTP(S) URL');
  }
  return normalized;
};

const cloneRaw = (raw) => {
  if (raw == null) return null;
  try {
    return structuredClone(raw);
  } catch {
    throw new CanonicalListingError('raw', 'raw must be structured-clone compatible');
  }
};

const encodeIdentityPart = (value) => `${Buffer.byteLength(value, 'utf8')}:${value}`;

export const canonicalListingId = (providerId, sourceListingId) => {
  const provider = requiredString(providerId, 'providerId');
  const sourceId = requiredString(sourceListingId, 'sourceListingId');
  const identity = `${encodeIdentityPart(provider)}${encodeIdentityPart(sourceId)}`;
  return createHash('sha256').update(identity).digest('hex');
};

export const createCanonicalListing = (input, { now = Date.now() } = {}) => {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new CanonicalListingError('listing', 'listing input must be an object');
  }

  if (!Number.isFinite(now) || now < 0) {
    throw new CanonicalListingError('now', 'now must be a non-negative epoch timestamp');
  }

  const providerId = requiredString(input.providerId, 'providerId');
  const sourceListingId = requiredString(input.sourceListingId, 'sourceListingId');
  const url = absoluteHttpUrl(input.url);
  const firstSeen = timestamp(input.firstSeen, now, 'firstSeen');
  const lastSeen = timestamp(input.lastSeen, now, 'lastSeen');

  if (lastSeen < firstSeen) {
    throw new CanonicalListingError('lastSeen', 'lastSeen must be greater than or equal to firstSeen');
  }

  const currency = nullableString(input.currency);

  return Object.freeze({
    id: canonicalListingId(providerId, sourceListingId),
    providerId,
    sourceListingId,
    url,
    title: nullableString(input.title),
    price: nullableNumber(input.price),
    currency: currency?.toUpperCase() ?? null,
    beds: nullableNumber(input.beds),
    baths: nullableNumber(input.baths),
    address: nullableString(input.address),
    latitude: coordinate(input.latitude, 'latitude', -90, 90),
    longitude: coordinate(input.longitude, 'longitude', -180, 180),
    imageUrl: nullableString(input.imageUrl),
    description: nullableString(input.description),
    firstSeen,
    lastSeen,
    raw: cloneRaw(input.raw),
  });
};
