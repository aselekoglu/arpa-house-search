import { expect } from 'chai';
import Database from 'better-sqlite3';
import esmock from 'esmock';

let migrateSearchProfiles;
try {
  ({ up: migrateSearchProfiles } = await import('../../lib/services/storage/migrations/sql/8.search-profiles.js'));
} catch {
  migrateSearchProfiles = null;
}

describe('Search Profile storage', () => {
  let db;
  let storage;

  beforeEach(async () => {
    if (!migrateSearchProfiles) return;
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO users (id) VALUES (?)').run('user-a');
    db.prepare('INSERT INTO users (id) VALUES (?)').run('user-b');
    migrateSearchProfiles(db);

    const SqliteConnection = {
      query(sql, params = {}) {
        return db.prepare(sql).all(params);
      },
      execute(sql, params = {}) {
        return db.prepare(sql).run(params);
      },
    };

    storage = await esmock('../../lib/services/storage/searchProfileStorage.js', {
      '../../lib/services/storage/SqliteConnection.js': { default: SqliteConnection },
    });
  });

  afterEach(() => db?.close());

  it('upserts and maps profiles without leaking JSON storage representation', () => {
    expect(storage, 'Search Profile storage module should exist').to.not.equal(undefined);
    if (!storage) return;

    const inserted = storage.upsert({
      id: 'profile-1',
      userId: 'user-a',
      name: 'Ottawa 2BR',
      city: 'Ottawa',
      region: 'ON',
      maxPrice: 2400,
      minBedrooms: 2,
      minBathrooms: 1,
      enabledSources: [
        { kind: 'provider', id: 'realtor-ca' },
        { kind: 'custom-source', id: 'source-1' },
      ],
      schedule: { enabled: true, intervalMinutes: 15 },
      createdAt: 100,
      updatedAt: 100,
    });

    expect(inserted).to.deep.equal({
      id: 'profile-1',
      userId: 'user-a',
      name: 'Ottawa 2BR',
      city: 'Ottawa',
      region: 'ON',
      maxPrice: 2400,
      minBedrooms: 2,
      minBathrooms: 1,
      enabledSources: [
        { kind: 'provider', id: 'realtor-ca' },
        { kind: 'custom-source', id: 'source-1' },
      ],
      schedule: { enabled: true, intervalMinutes: 15 },
      createdAt: 100,
      updatedAt: 100,
    });
    expect(storage.getById('profile-1')).to.deep.equal(inserted);
    expect(storage.listByUser('user-a')).to.deep.equal([inserted]);
    expect(storage.listByUser('user-b')).to.deep.equal([]);
  });

  it('round-trips null search bounds and updates persisted profile fields', () => {
    if (!storage) return;

    storage.upsert({
      id: 'profile-2', userId: 'user-a', name: 'Draft', city: 'Ottawa', region: 'ON',
      maxPrice: null, minBedrooms: null, minBathrooms: null,
      enabledSources: [], schedule: { enabled: false, intervalMinutes: 30 },
      createdAt: 200, updatedAt: 200,
    });

    const updated = storage.upsert({
      ...storage.getById('profile-2'),
      name: 'Updated',
      maxPrice: 2600,
      enabledSources: [{ kind: 'provider', id: 'realtor-ca' }],
      schedule: { enabled: true, intervalMinutes: 60 },
      updatedAt: 250,
    });

    expect(updated).to.deep.include({
      name: 'Updated', maxPrice: 2600, minBedrooms: null, minBathrooms: null, createdAt: 200, updatedAt: 250,
    });
    expect(updated.enabledSources).to.deep.equal([{ kind: 'provider', id: 'realtor-ca' }]);
    expect(updated.schedule).to.deep.equal({ enabled: true, intervalMinutes: 60 });
  });

  it('lists only profiles whose persisted schedule is enabled', () => {
    if (!storage) return;

    storage.upsert({
      id: 'scheduled-a', userId: 'user-a', name: 'Scheduled A', city: 'Ottawa', region: 'ON',
      maxPrice: null, minBedrooms: null, minBathrooms: null,
      enabledSources: [], schedule: { enabled: true, intervalMinutes: 15 },
      createdAt: 260, updatedAt: 260,
    });
    storage.upsert({
      id: 'manual-a', userId: 'user-a', name: 'Manual A', city: 'Ottawa', region: 'ON',
      maxPrice: null, minBedrooms: null, minBathrooms: null,
      enabledSources: [], schedule: { enabled: false, intervalMinutes: 15 },
      createdAt: 270, updatedAt: 270,
    });
    storage.upsert({
      id: 'scheduled-b', userId: 'user-b', name: 'Scheduled B', city: 'Ottawa', region: 'ON',
      maxPrice: null, minBedrooms: null, minBathrooms: null,
      enabledSources: [], schedule: { enabled: true, intervalMinutes: 30 },
      createdAt: 280, updatedAt: 280,
    });

    expect(storage.listScheduled().map((profile) => profile.id)).to.deep.equal([
      'scheduled-b',
      'scheduled-a',
    ]);
  });

  it('removes profiles and lets the user FK cascade clean up owned rows', () => {
    if (!storage) return;

    storage.upsert({
      id: 'profile-3', userId: 'user-a', name: 'Owned', city: 'Ottawa', region: 'ON',
      maxPrice: 2200, minBedrooms: 1, minBathrooms: 1,
      enabledSources: [], schedule: { enabled: false, intervalMinutes: 15 },
      createdAt: 300, updatedAt: 300,
    });
    storage.remove('profile-3');
    expect(storage.getById('profile-3')).to.equal(null);

    storage.upsert({
      id: 'profile-4', userId: 'user-a', name: 'Cascade', city: 'Ottawa', region: 'ON',
      maxPrice: null, minBedrooms: null, minBathrooms: null,
      enabledSources: [], schedule: { enabled: false, intervalMinutes: 15 },
      createdAt: 400, updatedAt: 400,
    });
    db.prepare('DELETE FROM users WHERE id = ?').run('user-a');
    expect(storage.getById('profile-4')).to.equal(null);
  });
});
