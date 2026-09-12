import { createCanonicalListing } from '../../domain/listing/canonicalListing.js';

const requiredSourceId = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError('sourceId is required');
  }
  return value.trim();
};

const firstNumber = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/,/g, '');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

export const mapCustomSourceRecordToCanonicalListing = ({
  sourceId,
  record,
  now = Date.now(),
} = {}) => {
  const id = requiredSourceId(sourceId);
  if (record == null || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('record must be an object');
  }

  return createCanonicalListing(
    {
      providerId: `custom-source:${id}`,
      sourceListingId: record.url,
      url: record.url,
      title: record.title,
      price: firstNumber(record.price),
      currency: 'CAD',
      beds: firstNumber(record.beds),
      baths: firstNumber(record.baths),
      address: record.address,
      imageUrl: record.image,
      raw: record,
    },
    { now },
  );
};
