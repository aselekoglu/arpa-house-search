export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_profile_runs
    (
      id          TEXT PRIMARY KEY,
      profile_id  TEXT NOT NULL,
      trigger     TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduled')),
      status      TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed')),
      started_at  INTEGER NOT NULL,
      finished_at INTEGER,
      FOREIGN KEY (profile_id) REFERENCES search_profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS search_profile_run_sources
    (
      run_id           TEXT NOT NULL,
      source_kind      TEXT NOT NULL CHECK (source_kind IN ('provider', 'custom-source')),
      source_id        TEXT NOT NULL,
      source_label     TEXT NOT NULL,
      status           TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
      discovered_count INTEGER NOT NULL DEFAULT 0,
      ingested_count   INTEGER NOT NULL DEFAULT 0,
      error_message    TEXT,
      started_at       INTEGER NOT NULL,
      finished_at      INTEGER NOT NULL,
      PRIMARY KEY (run_id, source_kind, source_id),
      FOREIGN KEY (run_id) REFERENCES search_profile_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_search_profile_runs_profile_started
      ON search_profile_runs (profile_id, started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_search_profile_run_sources_run_started
      ON search_profile_run_sources (run_id, started_at ASC);
  `);
}
