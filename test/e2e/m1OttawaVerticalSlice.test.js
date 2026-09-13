import { expect } from 'chai';
import Database from 'better-sqlite3';
import esmock from 'esmock';
import fs from 'node:fs';
import { normalizeRealtorListing } from '../../lib/providers/adapters/realtor-ca.js';
import { createListingFeedService } from '../../lib/services/listingFeed/listingFeedService.js';
import { createSearchProfileExecutionService } from '../../lib/services/searchProfiles/searchProfileExecutionService.js';
import { geocodedListings } from '../../ui/src/views/listings/listingMapModel.js';
import { up as migrateCustomSources } from '../../lib/services/storage/migrations/sql/7.custom-sources.js';
import { up as migrateSearchProfiles } from '../../lib/services/storage/migrations/sql/8.search-profiles.js';
import { up as migrateCanonicalFeed } from '../../lib/services/storage/migrations/sql/9.canonical-listing-feed.js';
import { up as migrateProfileRuns } from '../../lib/services/storage/migrations/sql/10.search-profile-runs.js';

const realtorFixture = JSON.parse(
  fs.readFileSync('test/fixtures/realtor/listing-normal.json', 'utf8'),
);

const sqliteAdapter = (db) => ({
  query(sql, params = {}) {
    return db.prepare(sql).all(params);
  },
  execute(sql, params = {}) {
    return db.prepare(sql).run(params);
  },
  withTransaction(fn) {
    return db.transaction(() => fn(db))();
  },
});

describe('M1 Ottawa vertical slice', () => {
  let db;
  let searchProfileStorage;
  let customSourceStorage;
  let canonicalListingStorage;
  let runStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO users (id) VALUES (?)').run('user-a');

    migrateCustomSources(db);
    migrateSearchProfiles(db);
    migrateCanonicalFeed(db);
    migrateProfileRuns(db);

    const SqliteConnection = sqliteAdapter(db);

    searchProfileStorage = await esmock('../../lib/services/storage/searchProfileStorage.js', {
      '../../lib/services/storage/SqliteConnection.js': { default: SqliteConnection },
    });
    customSourceStorage = await esmock('../../lib/services/storage/customSourceStorage.js', {
      '../../lib/services/storage/SqliteConnection.js': { default: SqliteConnection },
    });
    canonicalListingStorage = await esmock('../../lib/services/storage/canonicalListingStorage.js', {
      '../../lib/services/storage/SqliteConnection.js': { default: SqliteConnection },
    });
    runStorage = await esmock('../../lib/services/storage/searchProfileRunStorage.js', {
      '../../lib/services/storage/SqliteConnection.js': { default: SqliteConnection },
    });

    customSourceStorage.upsert({
      id: 'pm-1',
      userId: 'user-a',
      name: 'Example Property Manager',
      enabled: true,
      recipe: {
        version: 1,
        mode: 'static',
        url: 'https://pm.example/rentals',
        selectors: {
          container: '.listing',
          title: '.title',
          price: '.price',
          url: 'a',
        },
      },
      draftHash: 'recipe-v1',
      lastTestRecipeHash: 'recipe-v1',
      lastTestStatus: 'pass',
      lastTestReport: { activationReady: true },
      lastTestedAt: 10,
      createdAt: 10,
      updatedAt: 10,
    });

    searchProfileStorage.upsert({
      id: 'profile-a',
      userId: 'user-a',
      name: 'Ottawa rentals',
      city: 'Ottawa',
      region: 'ON',
      maxPrice: 2500,
      minBedrooms: 1,
      minBathrooms: 1,
      enabledSources: [
        { kind: 'provider', id: 'realtor-ca' },
        { kind: 'custom-source', id: 'pm-1' },
      ],
      schedule: { enabled: true, intervalMinutes: 15 },
      createdAt: 20,
      updatedAt: 20,
    });
  });

  afterEach(() => db.close());

  it('runs both sources, persists one mixed canonical feed, maps coordinates and preserves freshness on rerun', async () => {
    const providerRegistry = {
      get(id) {
        if (id !== 'realtor-ca') return null;
        return {
          id: 'realtor-ca',
          name: 'Realtor.ca',
          async discover() {
            return [structuredClone(realtorFixture)];
          },
          normalize(raw, { now }) {
            return normalizeRealtorListing(raw, { now });
          },
        };
      },
    };

    const staticExtractor = {
      async extract() {
        return {
          records: [
            {
              title: 'Centretown studio',
              price: '$1,950',
              url: 'https://pm.example/rentals/studio-1',
              image: 'https://pm.example/images/studio-1.jpg',
              beds: '0',
              baths: '1',
              address: '250 Somerset St W, Ottawa, ON',
            },
          ],
        };
      },
    };

    const listingFeedService = createListingFeedService({
      storage: canonicalListingStorage,
      searchProfileStorage,
      customSourceStorage,
    });

    let clock = 1_000;
    const runIds = ['run-1', 'run-2'];
    const executionService = createSearchProfileExecutionService({
      searchProfileStorage,
      customSourceStorage,
      providerRegistry,
      staticExtractor,
      browserExtractor: {
        async extract() {
          throw new Error('browser extractor should not run in static fixture scenario');
        },
      },
      listingFeedService,
      runStorage,
      idFactory: () => runIds.shift(),
      now: () => (clock += 10),
    });

    const firstRun = await executionService.execute({
      userId: 'user-a',
      profileId: 'profile-a',
      trigger: 'manual',
    });

    expect(firstRun.status).to.equal('completed');
    expect(firstRun.sources.map((source) => [source.sourceKind, source.sourceId, source.status])).to.deep.equal([
      ['provider', 'realtor-ca', 'completed'],
      ['custom-source', 'pm-1', 'completed'],
    ]);

    const firstFeed = listingFeedService.query({
      userId: 'user-a',
      profileId: 'profile-a',
      sort: 'newest',
    });

    expect(firstFeed).to.have.length(2);
    expect(new Set(firstFeed.map((listing) => listing.sourceLabel))).to.deep.equal(
      new Set(['Realtor.ca', 'Example Property Manager']),
    );

    const realtor = firstFeed.find((listing) => listing.sourceId === 'realtor-ca');
    const custom = firstFeed.find((listing) => listing.sourceId === 'pm-1');
    expect(realtor).to.deep.include({
      price: 2150,
      beds: 3,
      baths: 1.5,
      latitude: 45.415,
      longitude: -75.695,
    });
    expect(custom).to.deep.include({
      price: 1950,
      beds: 0,
      baths: 1,
      address: '250 Somerset St W, Ottawa, ON',
    });

    const mapListings = geocodedListings(firstFeed);
    expect(mapListings).to.have.length(1);
    expect(mapListings[0].sourceId).to.equal('realtor-ca');

    const firstSeenById = new Map(firstFeed.map((listing) => [listing.listingId, listing.firstSeen]));
    const firstLastSeenById = new Map(firstFeed.map((listing) => [listing.listingId, listing.lastSeen]));

    clock = 10_000;
    const secondRun = await executionService.execute({
      userId: 'user-a',
      profileId: 'profile-a',
      trigger: 'scheduled',
    });
    expect(secondRun.status).to.equal('completed');

    const secondFeed = listingFeedService.query({
      userId: 'user-a',
      profileId: 'profile-a',
      sort: 'newest',
    });

    expect(secondFeed).to.have.length(2);
    for (const listing of secondFeed) {
      expect(listing.firstSeen).to.equal(firstSeenById.get(listing.listingId));
      expect(listing.lastSeen).to.be.greaterThan(firstLastSeenById.get(listing.listingId));
    }

    const canonicalCount = db.prepare('SELECT COUNT(*) AS c FROM canonical_listings').get().c;
    const hitCount = db.prepare('SELECT COUNT(*) AS c FROM search_profile_listing_hits').get().c;
    expect(canonicalCount).to.equal(2);
    expect(hitCount).to.equal(2);
  });
});
