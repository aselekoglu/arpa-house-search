import { expect } from 'chai';
import { createCanonicalListing } from '../../../lib/domain/listing/canonicalListing.js';

const loadModule = async () =>
  import('../../../lib/services/searchProfiles/searchProfileExecutionService.js').catch(() => null);

const memoryRunStorage = () => {
  const runs = new Map();
  return {
    runs,
    createRun({ id, profileId, trigger, startedAt }) {
      runs.set(id, { id, profileId, trigger, status: 'running', startedAt, finishedAt: null, sources: [] });
      return this.getRun(id);
    },
    recordSourceResult(result) {
      const run = runs.get(result.runId);
      const index = run.sources.findIndex((s) => s.sourceKind === result.sourceKind && s.sourceId === result.sourceId);
      if (index >= 0) run.sources[index] = { ...result };
      else run.sources.push({ ...result });
      return { ...result };
    },
    finishRun({ id, status, finishedAt }) {
      const run = runs.get(id);
      run.status = status;
      run.finishedAt = finishedAt;
      return this.getRun(id);
    },
    getRun(id) {
      const run = runs.get(id);
      return run ? structuredClone(run) : null;
    },
    getLatestRun(profileId) {
      return [...runs.values()].filter((run) => run.profileId === profileId).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
    },
  };
};

const profile = (sources) => ({
  id: 'profile-a',
  userId: 'user-a',
  name: 'Ottawa rentals',
  city: 'Ottawa',
  region: 'ON',
  maxPrice: 2500,
  minBedrooms: 1,
  minBathrooms: 1,
  enabledSources: sources,
  schedule: { enabled: true, intervalMinutes: 15 },
  createdAt: 1,
  updatedAt: 1,
});

const realtorListing = (raw, now) =>
  createCanonicalListing({
    providerId: 'realtor-ca',
    sourceListingId: raw.id,
    url: `https://www.realtor.ca/real-estate/${raw.id}`,
    title: raw.title,
    price: raw.price,
    currency: 'CAD',
  }, { now });

describe('Search Profile execution service', () => {
  it('exports unified execution and typed access/concurrency errors', async () => {
    const mod = await loadModule();
    expect(mod, 'Search Profile execution service should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.createSearchProfileExecutionService).to.be.a('function');
    expect(mod.SearchProfileExecutionAccessError).to.be.a('function');
    expect(mod.SearchProfileRunInProgressError).to.be.a('function');
  });

  it('runs Realtor.ca and Custom Source through the same execution and Listing Feed ingest path', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const runStorage = memoryRunStorage();
    const feedCalls = [];
    const listingFeedService = {
      ingest(input) {
        feedCalls.push(input);
        return { ingested: input.listings.length };
      },
    };
    const providerRegistry = {
      get(id) {
        if (id !== 'realtor-ca') return null;
        return {
          name: 'Realtor.ca',
          async discover() {
            return [{ id: 'r-1', title: 'Realtor rental', price: 2200 }];
          },
          normalize(raw, { now }) {
            return realtorListing(raw, now);
          },
        };
      },
    };
    const staticExtractor = {
      async extract() {
        return {
          records: [{ title: 'PM rental', price: '$2,100', url: 'https://pm.example/r/1' }],
          pagesFetched: 1,
        };
      },
    };
    const customSourceStorage = {
      getById(id) {
        return id === 'pm-1'
          ? { id, userId: 'user-a', name: 'Example PM', enabled: true, recipe: { mode: 'static' } }
          : null;
      },
    };
    const service = mod.createSearchProfileExecutionService({
      searchProfileStorage: {
        getById() {
          return profile([
            { kind: 'provider', id: 'realtor-ca' },
            { kind: 'custom-source', id: 'pm-1' },
          ]);
        },
      },
      customSourceStorage,
      providerRegistry,
      staticExtractor,
      browserExtractor: { async extract() { throw new Error('browser should not run'); } },
      listingFeedService,
      runStorage,
      idFactory: () => 'run-1',
      now: (() => { let value = 100; return () => value += 10; })(),
    });

    const run = await service.execute({ userId: 'user-a', profileId: 'profile-a', trigger: 'manual' });

    expect(run.status).to.equal('completed');
    expect(run.trigger).to.equal('manual');
    expect(run.sources.map((s) => [s.sourceKind, s.sourceId, s.sourceLabel, s.status])).to.deep.equal([
      ['provider', 'realtor-ca', 'Realtor.ca', 'completed'],
      ['custom-source', 'pm-1', 'Example PM', 'completed'],
    ]);
    expect(feedCalls).to.have.length(2);
    expect(feedCalls.map((call) => [call.source.kind, call.source.id, call.listings.length])).to.deep.equal([
      ['provider', 'realtor-ca', 1],
      ['custom-source', 'pm-1', 1],
    ]);
    expect(feedCalls[0].listings[0].providerId).to.equal('realtor-ca');
    expect(feedCalls[1].listings[0].providerId).to.equal('custom-source:pm-1');
  });

  it('isolates a source failure, preserves its identity and continues remaining sources', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const runStorage = memoryRunStorage();
    const feedCalls = [];
    const service = mod.createSearchProfileExecutionService({
      searchProfileStorage: {
        getById() {
          return profile([
            { kind: 'provider', id: 'realtor-ca' },
            { kind: 'custom-source', id: 'pm-1' },
          ]);
        },
      },
      customSourceStorage: {
        getById() {
          return { id: 'pm-1', userId: 'user-a', name: 'Example PM', enabled: true, recipe: { mode: 'static' } };
        },
      },
      providerRegistry: {
        get() {
          return {
            name: 'Realtor.ca',
            async discover() { throw new Error('Realtor challenge'); },
            normalize() { throw new Error('not reached'); },
          };
        },
      },
      staticExtractor: {
        async extract() {
          return { records: [{ title: 'PM rental', price: '2100', url: 'https://pm.example/r/1' }] };
        },
      },
      browserExtractor: { async extract() { throw new Error('browser should not run'); } },
      listingFeedService: {
        ingest(input) {
          feedCalls.push(input);
          return { ingested: input.listings.length };
        },
      },
      runStorage,
      idFactory: () => 'run-2',
      now: (() => { let value = 200; return () => value += 10; })(),
    });

    const run = await service.execute({ userId: 'user-a', profileId: 'profile-a', trigger: 'scheduled' });

    expect(run.status).to.equal('partial');
    expect(run.sources).to.have.length(2);
    expect(run.sources[0]).to.deep.include({
      sourceKind: 'provider',
      sourceId: 'realtor-ca',
      sourceLabel: 'Realtor.ca',
      status: 'failed',
      discoveredCount: 0,
      ingestedCount: 0,
      errorMessage: 'Realtor challenge',
    });
    expect(run.sources[1]).to.deep.include({
      sourceKind: 'custom-source',
      sourceId: 'pm-1',
      sourceLabel: 'Example PM',
      status: 'completed',
      discoveredCount: 1,
      ingestedCount: 1,
      errorMessage: null,
    });
    expect(feedCalls).to.have.length(1);
    expect(feedCalls[0].source).to.deep.equal({ kind: 'custom-source', id: 'pm-1' });
  });

  it('releases the profile lock when run initialization fails before persistence', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const runStorage = memoryRunStorage();
    const service = mod.createSearchProfileExecutionService({
      searchProfileStorage: { getById() { return profile([]); } },
      customSourceStorage: { getById() { return null; } },
      providerRegistry: { get() { return null; } },
      staticExtractor: { async extract() { return { records: [] }; } },
      browserExtractor: { async extract() { return { records: [] }; } },
      listingFeedService: { ingest() { return { ingested: 0 }; } },
      runStorage,
      idFactory() { throw new Error('id generation failed'); },
    });

    expect(() => service.execute({
      userId: 'user-a',
      profileId: 'profile-a',
      trigger: 'manual',
    })).to.throw('id generation failed');
    expect(service.isRunning('profile-a')).to.equal(false);
    expect(runStorage.runs.size).to.equal(0);
  });

  it('rejects foreign profiles before creating a run record', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const runStorage = memoryRunStorage();
    const service = mod.createSearchProfileExecutionService({
      searchProfileStorage: { getById() { return profile([]); } },
      customSourceStorage: { getById() { return null; } },
      providerRegistry: { get() { return null; } },
      staticExtractor: { async extract() { return { records: [] }; } },
      browserExtractor: { async extract() { return { records: [] }; } },
      listingFeedService: { ingest() { return { ingested: 0 }; } },
      runStorage,
    });

    expect(() => service.execute({ userId: 'user-b', profileId: 'profile-a', trigger: 'manual' }))
      .to.throw(mod.SearchProfileExecutionAccessError);
    expect(runStorage.runs.size).to.equal(0);
  });
});
