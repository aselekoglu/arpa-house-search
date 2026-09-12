import { expect } from 'chai';
import Database from 'better-sqlite3';

let migration;
try {
  migration = await import('../../lib/services/storage/migrations/sql/9.canonical-listing-feed.js');
} catch {
  migration = null;
}

describe('Canonical listing feed migration', () => {
  it('creates canonical listing and Search Profile hit tables with cascade ownership boundaries', () => {
    expect(migration, 'canonical listing feed migration should exist').to.not.equal(null);
    if (!migration) return;

    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
      db.exec('CREATE TABLE search_profiles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL)');
      migration.up(db);

      const listingColumns = db.prepare('PRAGMA table_info(canonical_listings)').all().map((c) => c.name);
      expect(listingColumns).to.deep.equal([
        'id', 'provider_id', 'source_listing_id', 'url', 'title', 'price', 'currency',
        'beds', 'baths', 'address', 'latitude', 'longitude', 'image_url', 'description',
        'raw_json', 'first_seen', 'last_seen',
      ]);

      const hitColumns = db.prepare('PRAGMA table_info(search_profile_listing_hits)').all().map((c) => c.name);
      expect(hitColumns).to.deep.equal([
        'profile_id', 'listing_id', 'source_kind', 'source_id', 'source_label', 'first_seen', 'last_seen',
      ]);

      const fks = db.prepare('PRAGMA foreign_key_list(search_profile_listing_hits)').all();
      expect(fks.some((fk) => fk.table === 'search_profiles' && fk.from === 'profile_id' && fk.on_delete === 'CASCADE')).to.equal(true);
      expect(fks.some((fk) => fk.table === 'canonical_listings' && fk.from === 'listing_id' && fk.on_delete === 'CASCADE')).to.equal(true);

      const indexes = new Set(db.prepare('PRAGMA index_list(search_profile_listing_hits)').all().map((i) => i.name));
      expect(indexes.has('idx_profile_listing_hits_newest')).to.equal(true);
      expect(indexes.has('idx_profile_listing_hits_last_seen')).to.equal(true);
    } finally {
      db.close();
    }
  });
});
