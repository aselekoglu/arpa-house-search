export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_sources
    (
      id                    TEXT PRIMARY KEY,
      user_id               TEXT NOT NULL,
      name                  TEXT NOT NULL,
      enabled               INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      recipe_json           TEXT NOT NULL,
      draft_hash            TEXT NOT NULL,
      last_test_recipe_hash TEXT,
      last_test_status      TEXT CHECK (last_test_status IS NULL OR last_test_status IN ('pass', 'fail')),
      last_test_report_json TEXT,
      last_tested_at        INTEGER,
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_custom_sources_user
      ON custom_sources (user_id);

    CREATE INDEX IF NOT EXISTS idx_custom_sources_user_enabled
      ON custom_sources (user_id, enabled);
  `);
}
