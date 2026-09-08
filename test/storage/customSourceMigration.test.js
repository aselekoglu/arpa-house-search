import { expect } from 'chai';
import Database from 'better-sqlite3';

const loadMigration = async () => import('../../lib/services/storage/migrations/sql/7.custom-sources.js').catch(() => null);

describe('Custom Source migration', () => {
  it('creates the user-owned source lifecycle schema and indexes', async () => {
    const mod = await loadMigration();
    expect(mod, 'Custom Source migration should exist').to.not.equal(null);
    if (!mod) return;

    const db = new Database(':memory:');
    try {
      db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
      mod.up(db);

      const columns = db.prepare('PRAGMA table_info(custom_sources)').all().map((row) => row.name);
      expect(columns).to.deep.equal([
        'id',
        'user_id',
        'name',
        'enabled',
        'recipe_json',
        'draft_hash',
        'last_test_recipe_hash',
        'last_test_status',
        'last_test_report_json',
        'last_tested_at',
        'created_at',
        'updated_at',
      ]);

      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='custom_sources'").all();
      expect(indexes.map((row) => row.name)).to.include('idx_custom_sources_user');
      expect(indexes.map((row) => row.name)).to.include('idx_custom_sources_user_enabled');
    } finally {
      db.close();
    }
  });
});
