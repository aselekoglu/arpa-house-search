import { expect } from 'chai';
import Database from 'better-sqlite3';
import esmock from 'esmock';
import { up as migrateCustomSources } from '../../lib/services/storage/migrations/sql/7.custom-sources.js';

describe('Custom Source storage', () => {
  let db;
  let storage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO users (id) VALUES (?)').run('user-a');
    db.prepare('INSERT INTO users (id) VALUES (?)').run('user-b');
    migrateCustomSources(db);

    const SqliteConnection = {
      query(sql, params = {}) {
        return db.prepare(sql).all(params);
      },
      execute(sql, params = {}) {
        return db.prepare(sql).run(params);
      },
    };

    storage = await esmock('../../lib/services/storage/customSourceStorage.js', {
      '../../lib/services/storage/SqliteConnection.js': { default: SqliteConnection },
    });
  });

  afterEach(() => db.close());

  it('upserts and maps user-owned source rows without leaking JSON storage representation', () => {
    const inserted = storage.upsert({
      id: 'source-1',
      userId: 'user-a',
      name: 'Centretown PM',
      enabled: false,
      recipe: { version: 1, mode: 'static', url: 'https://example.com' },
      draftHash: 'draft-a',
      lastTestRecipeHash: null,
      lastTestStatus: null,
      lastTestReport: null,
      lastTestedAt: null,
      createdAt: 100,
      updatedAt: 100,
    });

    expect(inserted).to.deep.equal({
      id: 'source-1',
      userId: 'user-a',
      name: 'Centretown PM',
      enabled: false,
      recipe: { version: 1, mode: 'static', url: 'https://example.com' },
      draftHash: 'draft-a',
      lastTestRecipeHash: null,
      lastTestStatus: null,
      lastTestReport: null,
      lastTestedAt: null,
      createdAt: 100,
      updatedAt: 100,
    });

    expect(storage.getById('source-1')).to.deep.equal(inserted);
    expect(storage.listByUser('user-a')).to.deep.equal([inserted]);
    expect(storage.listByUser('user-b')).to.deep.equal([]);
  });

  it('updates draft fields while retaining persisted Test Extraction evidence supplied by lifecycle', () => {
    storage.upsert({
      id: 'source-2', userId: 'user-a', name: 'One', enabled: false,
      recipe: { a: 1 }, draftHash: 'a', lastTestRecipeHash: 'tested-a', lastTestStatus: 'pass',
      lastTestReport: { totalRecords: 3 }, lastTestedAt: 110, createdAt: 100, updatedAt: 110,
    });

    const updated = storage.upsert({
      ...storage.getById('source-2'),
      name: 'Two', enabled: true, recipe: { a: 2 }, draftHash: 'b', updatedAt: 120,
    });

    expect(updated).to.include({ name: 'Two', enabled: true, draftHash: 'b', lastTestRecipeHash: 'tested-a', lastTestStatus: 'pass' });
    expect(updated.recipe).to.deep.equal({ a: 2 });
    expect(updated.lastTestReport).to.deep.equal({ totalRecords: 3 });
  });

  it('records test evidence, changes enabled status, and removes a source', () => {
    storage.upsert({
      id: 'source-3', userId: 'user-a', name: 'Three', enabled: false,
      recipe: { a: 1 }, draftHash: 'a', lastTestRecipeHash: null, lastTestStatus: null,
      lastTestReport: null, lastTestedAt: null, createdAt: 100, updatedAt: 100,
    });

    const tested = storage.recordTest({
      id: 'source-3',
      lastTestRecipeHash: 'recipe-hash',
      lastTestStatus: 'pass',
      lastTestReport: { activationReady: true, coverage: { title: { present: 2, total: 2 } } },
      lastTestedAt: 200,
      updatedAt: 200,
    });
    expect(tested.lastTestStatus).to.equal('pass');
    expect(tested.lastTestReport.activationReady).to.equal(true);

    const enabled = storage.setEnabled({ id: 'source-3', enabled: true, updatedAt: 210 });
    expect(enabled.enabled).to.equal(true);
    expect(enabled.updatedAt).to.equal(210);

    storage.remove('source-3');
    expect(storage.getById('source-3')).to.equal(null);
  });
});
