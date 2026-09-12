import SqliteConnection from './SqliteConnection.js';

const toJson = (value) => JSON.stringify(value);
const fromJson = (value, fallback) => {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const mapRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    city: row.city,
    region: row.region,
    maxPrice: row.max_price ?? null,
    minBedrooms: row.min_bedrooms ?? null,
    minBathrooms: row.min_bathrooms ?? null,
    enabledSources: fromJson(row.enabled_sources_json, []),
    schedule: fromJson(row.schedule_json, { enabled: false, intervalMinutes: 15 }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const selectFields = `
  id,
  user_id,
  name,
  city,
  region,
  max_price,
  min_bedrooms,
  min_bathrooms,
  enabled_sources_json,
  schedule_json,
  created_at,
  updated_at
`;

export const getById = (id) => {
  const row = SqliteConnection.query(
    `SELECT ${selectFields} FROM search_profiles WHERE id = @id LIMIT 1`,
    { id },
  )[0];
  return mapRow(row);
};

export const listByUser = (userId) =>
  SqliteConnection.query(
    `SELECT ${selectFields}
       FROM search_profiles
      WHERE user_id = @userId
      ORDER BY updated_at DESC, name COLLATE NOCASE`,
    { userId },
  ).map(mapRow);

export const upsert = (profile) => {
  SqliteConnection.execute(
    `INSERT INTO search_profiles (
       id, user_id, name, city, region,
       max_price, min_bedrooms, min_bathrooms,
       enabled_sources_json, schedule_json,
       created_at, updated_at
     ) VALUES (
       @id, @userId, @name, @city, @region,
       @maxPrice, @minBedrooms, @minBathrooms,
       @enabledSourcesJson, @scheduleJson,
       @createdAt, @updatedAt
     )
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       city = excluded.city,
       region = excluded.region,
       max_price = excluded.max_price,
       min_bedrooms = excluded.min_bedrooms,
       min_bathrooms = excluded.min_bathrooms,
       enabled_sources_json = excluded.enabled_sources_json,
       schedule_json = excluded.schedule_json,
       updated_at = excluded.updated_at`,
    {
      id: profile.id,
      userId: profile.userId,
      name: profile.name,
      city: profile.city,
      region: profile.region,
      maxPrice: profile.maxPrice ?? null,
      minBedrooms: profile.minBedrooms ?? null,
      minBathrooms: profile.minBathrooms ?? null,
      enabledSourcesJson: toJson(profile.enabledSources ?? []),
      scheduleJson: toJson(profile.schedule ?? { enabled: false, intervalMinutes: 15 }),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    },
  );
  return getById(profile.id);
};

export const remove = (id) => {
  SqliteConnection.execute('DELETE FROM search_profiles WHERE id = @id', { id });
};
