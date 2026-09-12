import { expect } from 'chai';
import Database from 'better-sqlite3';

let migration;
try {
  migration = await import('../../lib/services/storage/migrations/sql/10.search-profile-runs.js');
} catch {
  migration = null;
}

describe('Search Profile run migration', () => {
  it('creates aggregate and per-source run records with cascade boundaries', () => {
    expect(migration, 'Search Profile run migration should exist').to.not.equal(null);
    if (!migration) return;

    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      db.exec('CREATE TABLE search_profiles (id TEXT PRIMARY KEY)');
      migration.up(db);

      const runColumns = db.prepare('PRAGMA table_info(search_profile_runs)').all().map((c) => c.name);
      expect(runColumns).to.deep.equal([
        'id', 'profile_id', 'trigger', 'status', 'started_at', 'finished_at',
      ]);

      const sourceColumns = db.prepare('PRAGMA table_info(search_profile_run_sources)').all().map((c) => c.name);
      expect(sourceColumns).to.deep.equal([
        'run_id', 'source_kind', 'source_id', 'source_label', 'status',
        'discovered_count', 'ingested_count', 'error_message', 'started_at', 'finished_at',
      ]);

      const runFks = db.prepare('PRAGMA foreign_key_list(search_profile_runs)').all();
      expect(runFks.some((fk) => fk.table === 'search_profiles' && fk.from === 'profile_id' && fk.on_delete === 'CASCADE')).to.equal(true);

      const sourceFks = db.prepare('PRAGMA foreign_key_list(search_profile_run_sources)').all();
      expect(sourceFks.some((fk) => fk.table === 'search_profile_runs' && fk.from === 'run_id' && fk.on_delete === 'CASCADE')).to.equal(true);

      const indexes = new Set(db.prepare('PRAGMA index_list(search_profile_runs)').all().map((i) => i.name));
      expect(indexes.has('idx_search_profile_runs_profile_started')).to.equal(true);
    } finally {
      db.close();
    }
  });
});
