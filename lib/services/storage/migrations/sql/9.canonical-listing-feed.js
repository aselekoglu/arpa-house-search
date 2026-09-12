export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_listings
    (
      id                TEXT PRIMARY KEY,
      provider_id       TEXT NOT NULL,
      source_listing_id TEXT NOT NULL,
      url               TEXT NOT NULL,
      title             TEXT,
      price             REAL,
      currency          TEXT,
      beds              REAL,
      baths             REAL,
      address           TEXT,
      latitude          REAL,
      longitude         REAL,
      image_url         TEXT,
      description       TEXT,
      raw_json          TEXT,
      first_seen        INTEGER NOT NULL,
      last_seen         INTEGER NOT NULL,
      UNIQUE (provider_id, source_listing_id)
    );

    CREATE TABLE IF NOT EXISTS search_profile_listing_hits
    (
      profile_id   TEXT NOT NULL,
      listing_id   TEXT NOT NULL,
      source_kind  TEXT NOT NULL CHECK (source_kind IN ('provider', 'custom-source')),
      source_id    TEXT NOT NULL,
      source_label TEXT NOT NULL,
      first_seen   INTEGER NOT NULL,
      last_seen    INTEGER NOT NULL,
      PRIMARY KEY (profile_id, listing_id),
      FOREIGN KEY (profile_id) REFERENCES search_profiles(id) ON DELETE CASCADE,
      FOREIGN KEY (listing_id) REFERENCES canonical_listings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_profile_listing_hits_newest
      ON search_profile_listing_hits (profile_id, first_seen DESC);

    CREATE INDEX IF NOT EXISTS idx_profile_listing_hits_last_seen
      ON search_profile_listing_hits (profile_id, last_seen DESC);
  `);
}
