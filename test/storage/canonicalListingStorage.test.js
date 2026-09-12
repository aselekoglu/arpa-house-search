import { expect } from 'chai';
import Database from 'better-sqlite3';
import esmock from 'esmock';

let migrate;
try {
  ({ up: migrate } = await import('../../lib/services/storage/migrations/sql/9.canonical-listing-feed.js'));
} catch {
  migrate = null;
}

describe('Canonical listing feed storage', () => {
  let db;
  let storage;

  beforeEach(async () => {
    if (!migrate) return;
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
    db.exec('CREATE TABLE search_profiles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL)');
    db.prepare('INSERT INTO users (id) VALUES (?)').run('user-a');
    db.prepare('INSERT INTO search_profiles (id, user_id) VALUES (?, ?)').run('profile-a', 'user-a');
    migrate(db);

    const SqliteConnection = {
      query(sql, params = {}) { return db.prepare(sql).all(params); },
      execute(sql, params = {}) { return db.prepare(sql).run(params); },
      withTransaction(fn) { return db.transaction(() => fn(db))(); },
    };

    storage = await esmock('../../lib/services/storage/canonicalListingStorage.js', {
      '../../lib/services/storage/SqliteConnection.js': { default: SqliteConnection },
    });
  });

  afterEach(() => db?.close());

  const listing = (overrides = {}) => ({
    id: 'listing-1',
    providerId: 'realtor-ca',
    sourceListingId: '28123456',
    url: 'https://www.realtor.ca/real-estate/28123456/example',
    title: 'Two bedroom',
    price: 2200,
    currency: 'CAD',
    beds: 2,
    baths: 1,
    address: '123 Bank St',
    latitude: 45.41,
    longitude: -75.69,
    imageUrl: 'https://img.example/1.jpg',
    description: 'Bright unit',
    raw: { source: true },
    firstSeen: 100,
    lastSeen: 100,
    ...overrides,
  });

  it('upserts canonical listing data while preserving earliest firstSeen and advancing lastSeen', () => {
    expect(storage, 'canonical listing storage should exist').to.not.equal(undefined);
    if (!storage) return;

    storage.upsertCanonicalListing(listing());
    const updated = storage.upsertCanonicalListing(listing({
      price: 2250,
      title: null,
      firstSeen: 150,
      lastSeen: 200,
    }));

    expect(updated).to.deep.include({
      id: 'listing-1',
      title: 'Two bedroom',
      price: 2250,
      firstSeen: 100,
      lastSeen: 200,
    });
    expect(updated.raw).to.deep.equal({ source: true });
  });

  it('upserts Search Profile hits without resetting profile freshness', () => {
    if (!storage) return;
    storage.upsertCanonicalListing(listing());

    storage.upsertProfileHit({
      profileId: 'profile-a',
      listingId: 'listing-1',
      sourceKind: 'provider',
      sourceId: 'realtor-ca',
      sourceLabel: 'Realtor.ca',
      seenAt: 100,
    });
    storage.upsertProfileHit({
      profileId: 'profile-a',
      listingId: 'listing-1',
      sourceKind: 'provider',
      sourceId: 'realtor-ca',
      sourceLabel: 'Realtor.ca',
      seenAt: 250,
    });

    const rows = storage.queryProfileFeed({ profileId: 'profile-a', sort: 'newest' });
    expect(rows).to.have.length(1);
    expect(rows[0]).to.deep.include({
      profileId: 'profile-a',
      listingId: 'listing-1',
      sourceKind: 'provider',
      sourceId: 'realtor-ca',
      sourceLabel: 'Realtor.ca',
      firstSeen: 100,
      lastSeen: 250,
      price: 2200,
    });
  });

  it('returns Realtor.ca and Custom Source listings together in one Search Profile feed', () => {
    if (!storage) return;

    const realtor = listing({ id: 'realtor-1', sourceListingId: 'r-1', title: 'Realtor rental' });
    const custom = listing({
      id: 'custom-1',
      providerId: 'custom-source:pm-1',
      sourceListingId: 'https://pm.example/r/1',
      url: 'https://pm.example/r/1',
      title: 'Property manager rental',
      price: 2050,
    });

    storage.upsertCanonicalListing(realtor);
    storage.upsertProfileHit({
      profileId: 'profile-a',
      listingId: realtor.id,
      sourceKind: 'provider',
      sourceId: 'realtor-ca',
      sourceLabel: 'Realtor.ca',
      seenAt: 200,
    });

    storage.upsertCanonicalListing(custom);
    storage.upsertProfileHit({
      profileId: 'profile-a',
      listingId: custom.id,
      sourceKind: 'custom-source',
      sourceId: 'pm-1',
      sourceLabel: 'Example Property Manager',
      seenAt: 300,
    });

    const feed = storage.queryProfileFeed({ profileId: 'profile-a', sort: 'newest' });
    expect(feed.map((row) => [row.sourceKind, row.sourceId, row.sourceLabel, row.title])).to.deep.equal([
      ['custom-source', 'pm-1', 'Example Property Manager', 'Property manager rental'],
      ['provider', 'realtor-ca', 'Realtor.ca', 'Realtor rental'],
    ]);
  });

  it('sorts a profile feed by newest and price with unknown prices last', () => {
    if (!storage) return;

    const entries = [
      [listing({ id: 'a', sourceListingId: 'a', price: 2100 }), 300],
      [listing({ id: 'b', sourceListingId: 'b', price: null }), 400],
      [listing({ id: 'c', sourceListingId: 'c', price: 1900 }), 200],
    ];
    for (const [item, seenAt] of entries) {
      storage.upsertCanonicalListing(item);
      storage.upsertProfileHit({
        profileId: 'profile-a', listingId: item.id,
        sourceKind: 'provider', sourceId: 'realtor-ca', sourceLabel: 'Realtor.ca', seenAt,
      });
    }

    expect(storage.queryProfileFeed({ profileId: 'profile-a', sort: 'newest' }).map((row) => row.listingId)).to.deep.equal(['b', 'a', 'c']);
    expect(storage.queryProfileFeed({ profileId: 'profile-a', sort: 'price-asc' }).map((row) => row.listingId)).to.deep.equal(['c', 'a', 'b']);
    expect(storage.queryProfileFeed({ profileId: 'profile-a', sort: 'price-desc' }).map((row) => row.listingId)).to.deep.equal(['a', 'c', 'b']);
  });
});
