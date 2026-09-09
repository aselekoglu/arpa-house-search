import { expect } from 'chai';
import Database from 'better-sqlite3';

let migration;
try {
  migration = await import('../../lib/services/storage/migrations/sql/8.search-profiles.js');
} catch {
  migration = null;
}

describe('Search Profile migration', () => {
  it('creates the user-owned Search Profile schema, FK and indexes', () => {
    expect(migration, 'Search Profile migration module should exist').to.not.equal(null);
    if (!migration) return;

    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
      migration.up(db);

      const columns = db.prepare('PRAGMA table_info(search_profiles)').all().map((column) => column.name);
      expect(columns).to.deep.equal([
        'id',
        'user_id',
        'name',
        'city',
        'region',
        'max_price',
        'min_bedrooms',
        'min_bathrooms',
        'enabled_sources_json',
        'schedule_json',
        'created_at',
        'updated_at',
      ]);

      const foreignKeys = db.prepare('PRAGMA foreign_key_list(search_profiles)').all();
      expect(foreignKeys).to.have.length(1);
      expect(foreignKeys[0]).to.include({ table: 'users', from: 'user_id', to: 'id', on_delete: 'CASCADE' });

      const indexes = new Set(db.prepare('PRAGMA index_list(search_profiles)').all().map((index) => index.name));
      expect(indexes.has('idx_search_profiles_user')).to.equal(true);
      expect(indexes.has('idx_search_profiles_user_updated')).to.equal(true);
    } finally {
      db.close();
    }
  });
});
