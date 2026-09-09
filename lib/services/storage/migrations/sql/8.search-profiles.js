export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_profiles
    (
      id                   TEXT PRIMARY KEY,
      user_id              TEXT NOT NULL,
      name                 TEXT NOT NULL,
      city                 TEXT NOT NULL,
      region               TEXT NOT NULL,
      max_price            REAL,
      min_bedrooms         REAL,
      min_bathrooms        REAL,
      enabled_sources_json TEXT NOT NULL,
      schedule_json        TEXT NOT NULL,
      created_at           INTEGER NOT NULL,
      updated_at           INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_search_profiles_user
      ON search_profiles (user_id);

    CREATE INDEX IF NOT EXISTS idx_search_profiles_user_updated
      ON search_profiles (user_id, updated_at DESC);
  `);
}
