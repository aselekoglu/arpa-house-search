import { expect } from 'chai';
import Database from 'better-sqlite3';
import esmock from 'esmock';

let migrate;
try {
  ({ up: migrate } = await import('../../lib/services/storage/migrations/sql/10.search-profile-runs.js'));
} catch {
  migrate = null;
}

describe('Search Profile run storage', () => {
  let db;
  let storage;

  beforeEach(async () => {
    if (!migrate) return;
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE search_profiles (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO search_profiles (id) VALUES (?)').run('profile-a');
    migrate(db);

    const SqliteConnection = {
      query(sql, params = {}) { return db.prepare(sql).all(params); },
      execute(sql, params = {}) { return db.prepare(sql).run(params); },
    };

    storage = await esmock('../../lib/services/storage/searchProfileRunStorage.js', {
      '../../lib/services/storage/SqliteConnection.js': { default: SqliteConnection },
    });
  });

  afterEach(() => db?.close());

  it('creates, records source outcomes and finalizes one durable run', () => {
    expect(storage, 'Search Profile run storage should exist').to.not.equal(undefined);
    if (!storage) return;

    storage.createRun({
      id: 'run-1',
      profileId: 'profile-a',
      trigger: 'manual',
      startedAt: 100,
    });

    storage.recordSourceResult({
      runId: 'run-1',
      sourceKind: 'provider',
      sourceId: 'realtor-ca',
      sourceLabel: 'Realtor.ca',
      status: 'failed',
      discoveredCount: 0,
      ingestedCount: 0,
      errorMessage: 'challenge',
      startedAt: 110,
      finishedAt: 120,
    });
    storage.recordSourceResult({
      runId: 'run-1',
      sourceKind: 'custom-source',
      sourceId: 'pm-1',
      sourceLabel: 'Example PM',
      status: 'completed',
      discoveredCount: 3,
      ingestedCount: 3,
      errorMessage: null,
      startedAt: 130,
      finishedAt: 140,
    });
    storage.finishRun({ id: 'run-1', status: 'partial', finishedAt: 150 });

    expect(storage.getRun('run-1')).to.deep.equal({
      id: 'run-1',
      profileId: 'profile-a',
      trigger: 'manual',
      status: 'partial',
      startedAt: 100,
      finishedAt: 150,
      sources: [
        {
          runId: 'run-1',
          sourceKind: 'provider',
          sourceId: 'realtor-ca',
          sourceLabel: 'Realtor.ca',
          status: 'failed',
          discoveredCount: 0,
          ingestedCount: 0,
          errorMessage: 'challenge',
          startedAt: 110,
          finishedAt: 120,
        },
        {
          runId: 'run-1',
          sourceKind: 'custom-source',
          sourceId: 'pm-1',
          sourceLabel: 'Example PM',
          status: 'completed',
          discoveredCount: 3,
          ingestedCount: 3,
          errorMessage: null,
          startedAt: 130,
          finishedAt: 140,
        },
      ],
    });
    expect(storage.getLatestRun('profile-a').id).to.equal('run-1');
  });

  it('keeps source identity stable when an outcome is updated', () => {
    if (!storage) return;
    storage.createRun({ id: 'run-2', profileId: 'profile-a', trigger: 'scheduled', startedAt: 200 });
    storage.recordSourceResult({
      runId: 'run-2', sourceKind: 'provider', sourceId: 'realtor-ca', sourceLabel: 'Realtor.ca',
      status: 'failed', discoveredCount: 0, ingestedCount: 0, errorMessage: 'first',
      startedAt: 210, finishedAt: 220,
    });
    storage.recordSourceResult({
      runId: 'run-2', sourceKind: 'provider', sourceId: 'realtor-ca', sourceLabel: 'Realtor.ca',
      status: 'completed', discoveredCount: 2, ingestedCount: 2, errorMessage: null,
      startedAt: 210, finishedAt: 230,
    });

    const run = storage.getRun('run-2');
    expect(run.sources).to.have.length(1);
    expect(run.sources[0]).to.deep.include({
      sourceKind: 'provider',
      sourceId: 'realtor-ca',
      sourceLabel: 'Realtor.ca',
      status: 'completed',
      discoveredCount: 2,
      ingestedCount: 2,
      errorMessage: null,
    });
  });
});
