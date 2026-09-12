const SOURCE_KINDS = new Set(['provider', 'custom-source']);
const SOURCE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

const requiredText = (value, field, { maxLength = 160 } = {}) => {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a non-empty string`);
  const normalized = value.trim();
  if (normalized.length === 0) throw new TypeError(`${field} must be a non-empty string`);
  if (normalized.length > maxLength) throw new TypeError(`${field} must be at most ${maxLength} characters`);
  return normalized;
};

const optionalNonNegativeNumber = (value, field) => {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be a finite non-negative number or null`);
  }
  return value;
};

const timestamp = (value, field) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be a finite non-negative timestamp`);
  }
  return value;
};

export const validateSourceReference = (input) => {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('source reference must be an object');
  }

  const kind = requiredText(input.kind, 'source kind', { maxLength: 32 });
  if (!SOURCE_KINDS.has(kind)) {
    throw new TypeError(`source kind must be one of: ${[...SOURCE_KINDS].join(', ')}`);
  }

  const id = requiredText(input.id, 'source id', { maxLength: 128 });
  if (!SOURCE_ID_PATTERN.test(id)) {
    throw new TypeError('source id contains unsupported characters');
  }

  return Object.freeze({ kind, id });
};

const normalizeEnabledSources = (value) => {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError('enabledSources must be an array');

  const normalized = value.map(validateSourceReference);
  const seen = new Set();
  for (const source of normalized) {
    const key = `${source.kind}:${source.id}`;
    if (seen.has(key)) throw new TypeError(`enabledSources contains duplicate source ${key}`);
    seen.add(key);
  }
  return Object.freeze(normalized);
};

const normalizeSchedule = (value) => {
  const input = value ?? { enabled: false, intervalMinutes: 15 };
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('schedule must be an object');
  }

  const enabled = input.enabled ?? false;
  if (typeof enabled !== 'boolean') throw new TypeError('schedule.enabled must be a boolean');

  const intervalMinutes = input.intervalMinutes ?? 15;
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
    throw new TypeError('schedule.intervalMinutes must be an integer between 1 and 1440');
  }

  return Object.freeze({ enabled, intervalMinutes });
};

export const createSearchProfile = (input, { now = Date.now } = {}) => {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Search Profile input must be an object');
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const nowValue = input.createdAt == null && input.updatedAt == null ? now() : null;
  const createdAt = timestamp(input.createdAt ?? nowValue ?? now(), 'createdAt');
  const updatedAt = timestamp(input.updatedAt ?? createdAt, 'updatedAt');
  if (updatedAt < createdAt) throw new TypeError('updatedAt must be greater than or equal to createdAt');

  const profile = {
    id: requiredText(input.id, 'id', { maxLength: 128 }),
    userId: requiredText(input.userId, 'userId', { maxLength: 128 }),
    name: requiredText(input.name, 'name', { maxLength: 160 }),
    city: input.city == null ? 'Ottawa' : requiredText(input.city, 'city', { maxLength: 120 }),
    region: input.region == null ? 'ON' : requiredText(input.region, 'region', { maxLength: 120 }),
    maxPrice: optionalNonNegativeNumber(input.maxPrice, 'maxPrice'),
    minBedrooms: optionalNonNegativeNumber(input.minBedrooms, 'minBedrooms'),
    minBathrooms: optionalNonNegativeNumber(input.minBathrooms, 'minBathrooms'),
    enabledSources: normalizeEnabledSources(input.enabledSources),
    schedule: normalizeSchedule(input.schedule),
    createdAt,
    updatedAt,
  };

  return Object.freeze(profile);
};
