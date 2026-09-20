const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT TRUE,
    last_login BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS custom_sources (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    recipe JSONB NOT NULL,
    last_test_recipe_hash TEXT,
    last_test_report JSONB,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_custom_sources_user ON custom_sources(user_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS search_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    region TEXT NOT NULL,
    max_price DOUBLE PRECISION,
    min_bedrooms DOUBLE PRECISION,
    min_bathrooms DOUBLE PRECISION,
    enabled_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    schedule JSONB NOT NULL DEFAULT '{"enabled":false,"intervalMinutes":15}'::jsonb,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_search_profiles_user ON search_profiles(user_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS canonical_listings (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    source_listing_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    price DOUBLE PRECISION,
    currency TEXT,
    beds DOUBLE PRECISION,
    baths DOUBLE PRECISION,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    image_url TEXT,
    description TEXT,
    raw_json JSONB,
    first_seen BIGINT NOT NULL,
    last_seen BIGINT NOT NULL,
    UNIQUE(provider_id, source_listing_id)
  )`,
  `CREATE TABLE IF NOT EXISTS search_profile_listing_hits (
    profile_id TEXT NOT NULL REFERENCES search_profiles(id) ON DELETE CASCADE,
    listing_id TEXT NOT NULL REFERENCES canonical_listings(id) ON DELETE CASCADE,
    source_kind TEXT NOT NULL CHECK(source_kind IN ('provider','custom-source')),
    source_id TEXT NOT NULL,
    source_label TEXT NOT NULL,
    first_seen BIGINT NOT NULL,
    last_seen BIGINT NOT NULL,
    PRIMARY KEY(profile_id, listing_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_profile_hits_newest ON search_profile_listing_hits(profile_id, first_seen DESC)`,
  `CREATE TABLE IF NOT EXISTS search_profile_runs (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES search_profiles(id) ON DELETE CASCADE,
    trigger TEXT NOT NULL CHECK(trigger IN ('manual','scheduled')),
    status TEXT NOT NULL CHECK(status IN ('running','completed','partial','failed')),
    started_at BIGINT NOT NULL,
    finished_at BIGINT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_profile_runs_started ON search_profile_runs(profile_id, started_at DESC)`,
  `CREATE TABLE IF NOT EXISTS search_profile_run_sources (
    run_id TEXT NOT NULL REFERENCES search_profile_runs(id) ON DELETE CASCADE,
    source_kind TEXT NOT NULL CHECK(source_kind IN ('provider','custom-source')),
    source_id TEXT NOT NULL,
    source_label TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('completed','failed')),
    discovered_count INTEGER NOT NULL DEFAULT 0,
    ingested_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at BIGINT NOT NULL,
    finished_at BIGINT NOT NULL,
    PRIMARY KEY(run_id, source_kind, source_id)
  )`,
];

export const ensureProductionSchema = async (client) => {
  if (client == null || typeof client.transaction !== 'function') {
    throw new TypeError('client must expose transaction()');
  }
  await client.transaction(statements.map((query) => ({ query, params: [] })));
};
