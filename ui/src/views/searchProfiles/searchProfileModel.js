const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

const numberOrNull = (value, field) => {
  if (value == null || (typeof value === 'string' && value.trim().length === 0)) return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new TypeError(`${field} must be a finite non-negative number or blank`);
  }
  return parsed;
};

const intervalMinutes = (value) => {
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1440) {
    throw new TypeError('intervalMinutes must be an integer between 1 and 1440');
  }
  return parsed;
};

const sourceReferenceFromKey = (key) => {
  if (typeof key !== 'string') throw new TypeError('source key must be a string');
  if (key.startsWith('provider:')) {
    const id = key.slice('provider:'.length);
    if (!id) throw new TypeError('provider source key must include an id');
    return { kind: 'provider', id };
  }
  if (key.startsWith('custom-source:')) {
    const id = key.slice('custom-source:'.length);
    if (!id) throw new TypeError('custom-source key must include an id');
    return { kind: 'custom-source', id };
  }
  throw new TypeError(`unsupported source key: ${key}`);
};

const sourceKey = (source) => `${source.kind}:${source.id}`;

export const createEmptySearchProfileForm = () => ({
  profileId: null,
  name: '',
  city: 'Ottawa',
  region: 'ON',
  maxPrice: '',
  minBedrooms: '',
  minBathrooms: '',
  selectedSourceKeys: [],
  scheduleEnabled: false,
  intervalMinutes: '15',
});

export const searchProfilePayloadFromForm = (form) => ({
  profileId: form.profileId ?? null,
  name: cleanText(form.name),
  city: cleanText(form.city),
  region: cleanText(form.region),
  maxPrice: numberOrNull(form.maxPrice, 'maxPrice'),
  minBedrooms: numberOrNull(form.minBedrooms, 'minBedrooms'),
  minBathrooms: numberOrNull(form.minBathrooms, 'minBathrooms'),
  enabledSources: Array.isArray(form.selectedSourceKeys) ? form.selectedSourceKeys.map(sourceReferenceFromKey) : [],
  schedule: {
    enabled: Boolean(form.scheduleEnabled),
    intervalMinutes: intervalMinutes(form.intervalMinutes),
  },
});

export const searchProfileFormFromProfile = (profile) => ({
  profileId: profile?.id ?? null,
  name: profile?.name ?? '',
  city: profile?.city ?? 'Ottawa',
  region: profile?.region ?? 'ON',
  maxPrice: profile?.maxPrice == null ? '' : String(profile.maxPrice),
  minBedrooms: profile?.minBedrooms == null ? '' : String(profile.minBedrooms),
  minBathrooms: profile?.minBathrooms == null ? '' : String(profile.minBathrooms),
  selectedSourceKeys: Array.isArray(profile?.enabledSources) ? profile.enabledSources.map(sourceKey) : [],
  scheduleEnabled: Boolean(profile?.schedule?.enabled),
  intervalMinutes: String(profile?.schedule?.intervalMinutes ?? 15),
});

export const sourceOptionsFromCustomSources = (customSources) => {
  const options = [
    { key: 'provider:realtor-ca', kind: 'provider', id: 'realtor-ca', label: 'Realtor.ca' },
  ];
  if (!Array.isArray(customSources)) return options;

  for (const source of customSources) {
    if (!source?.enabled || typeof source.id !== 'string' || source.id.length === 0) continue;
    options.push({
      key: `custom-source:${source.id}`,
      kind: 'custom-source',
      id: source.id,
      label: typeof source.name === 'string' && source.name.length > 0 ? source.name : source.id,
    });
  }
  return options;
};

export const searchProfileErrorMessage = (error) => {
  if (typeof error === 'string' && error.length > 0) return error;
  const body = error?.json ?? error ?? {};
  return typeof body.message === 'string' && body.message.length > 0
    ? body.message
    : 'Search Profile request failed';
};
