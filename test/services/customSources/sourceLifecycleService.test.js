import { expect } from 'chai';

const loadModule = async () => import('../../../lib/services/customSources/sourceLifecycleService.js').catch(() => null);

const validRecipe = (overrides = {}) => ({
  version: 1,
  mode: 'static',
  url: 'https://rentals.example.com/ottawa',
  selectors: {
    listing: '.listing',
    title: '.title',
    price: '.price',
    url: 'a.details',
  },
  ...overrides,
});

const createMemoryStorage = () => {
  const rows = new Map();
  const calls = { upsert: [], recordTest: [], setEnabled: [], remove: [] };
  return {
    rows,
    calls,
    listByUser(userId) {
      return [...rows.values()].filter((row) => row.userId === userId);
    },
    getById(id) {
      return rows.get(id) ?? null;
    },
    upsert(row) {
      calls.upsert.push(row);
      const previous = rows.get(row.id) ?? {};
      rows.set(row.id, { ...previous, ...row });
      return rows.get(row.id);
    },
    recordTest({ id, ...test }) {
      calls.recordTest.push({ id, ...test });
      rows.set(id, { ...rows.get(id), ...test });
      return rows.get(id);
    },
    setEnabled({ id, enabled, updatedAt }) {
      calls.setEnabled.push({ id, enabled, updatedAt });
      rows.set(id, { ...rows.get(id), enabled, updatedAt });
      return rows.get(id);
    },
    remove(id) {
      calls.remove.push(id);
      rows.delete(id);
    },
  };
};

describe('Custom Source lifecycle service', () => {
  it('exports the lifecycle factory and typed lifecycle errors', async () => {
    const mod = await loadModule();
    expect(mod, 'Custom Source lifecycle service module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.createCustomSourceLifecycleService).to.be.a('function');
    expect(mod.CustomSourceOwnershipError).to.be.a('function');
    expect(mod.CustomSourceActivationError).to.be.a('function');
  });

  it('saves incomplete recipes as disabled user-owned drafts', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const storage = createMemoryStorage();
    const service = mod.createCustomSourceLifecycleService({
      storage,
      testService: { test: async () => { throw new Error('not used'); } },
      idFactory: () => 'source-1',
      now: () => 1000,
    });

    const saved = service.saveDraft({
      userId: 'user-a',
      name: 'Local PM site',
      recipe: { version: 1, mode: 'static', url: 'https://example.com' },
    });

    expect(saved).to.include({ id: 'source-1', userId: 'user-a', name: 'Local PM site', enabled: false });
    expect(saved.recipe).to.deep.equal({ version: 1, mode: 'static', url: 'https://example.com' });
    expect(saved.draftHash).to.match(/^[a-f0-9]{64}$/);
    expect(saved.createdAt).to.equal(1000);
    expect(saved.updatedAt).to.equal(1000);
  });

  it('persists Test Extraction evidence and activates only an exact successfully-tested normalized recipe', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const storage = createMemoryStorage();
    let currentRecipeHash = 'a'.repeat(64);
    const testService = {
      async test() {
        return {
          recipeHash: currentRecipeHash,
          activationReady: true,
          totalRecords: 3,
          coverage: {
            title: { present: 3, total: 3 },
            price: { present: 3, total: 3 },
            url: { present: 3, total: 3 },
          },
          preview: [],
        };
      },
    };
    const service = mod.createCustomSourceLifecycleService({
      storage,
      testService,
      normalizeAndHash: () => currentRecipeHash,
      idFactory: () => 'source-2',
      now: (() => { let value = 2000; return () => value++; })(),
    });

    service.saveDraft({ userId: 'user-a', name: 'Tested source', recipe: validRecipe() });
    const report = await service.testSource({ userId: 'user-a', sourceId: 'source-2' });
    expect(report.activationReady).to.equal(true);
    expect(storage.getById('source-2').lastTestStatus).to.equal('pass');
    expect(storage.getById('source-2').lastTestRecipeHash).to.equal(currentRecipeHash);

    const active = service.setEnabled({ userId: 'user-a', sourceId: 'source-2', enabled: true });
    expect(active.enabled).to.equal(true);

    currentRecipeHash = 'b'.repeat(64);
    try {
      service.setEnabled({ userId: 'user-a', sourceId: 'source-2', enabled: true });
      expect.fail('Expected stale Test Extraction evidence to block activation');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.CustomSourceActivationError);
    }
  });

  it('records failed extraction coverage and refuses activation', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const storage = createMemoryStorage();
    const service = mod.createCustomSourceLifecycleService({
      storage,
      testService: {
        test: async () => ({
          recipeHash: 'c'.repeat(64),
          activationReady: false,
          totalRecords: 2,
          coverage: { title: { present: 2, total: 2 }, price: { present: 1, total: 2 }, url: { present: 2, total: 2 } },
          preview: [],
        }),
      },
      normalizeAndHash: () => 'c'.repeat(64),
      idFactory: () => 'source-3',
      now: () => 3000,
    });

    service.saveDraft({ userId: 'user-a', name: 'Partial source', recipe: validRecipe() });
    await service.testSource({ userId: 'user-a', sourceId: 'source-3' });
    expect(storage.getById('source-3').lastTestStatus).to.equal('fail');

    expect(() => service.setEnabled({ userId: 'user-a', sourceId: 'source-3', enabled: true })).to.throw(
      mod.CustomSourceActivationError,
    );
  });

  it('automatically disables an active source when its draft recipe changes', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const storage = createMemoryStorage();
    const service = mod.createCustomSourceLifecycleService({
      storage,
      testService: { test: async () => ({ recipeHash: 'd'.repeat(64), activationReady: true }) },
      normalizeAndHash: () => 'd'.repeat(64),
      idFactory: () => 'source-4',
      now: (() => { let value = 4000; return () => value++; })(),
    });

    service.saveDraft({ userId: 'user-a', name: 'Active source', recipe: validRecipe() });
    await service.testSource({ userId: 'user-a', sourceId: 'source-4' });
    service.setEnabled({ userId: 'user-a', sourceId: 'source-4', enabled: true });
    expect(storage.getById('source-4').enabled).to.equal(true);

    const changed = service.saveDraft({
      userId: 'user-a',
      sourceId: 'source-4',
      name: 'Active source',
      recipe: validRecipe({ url: 'https://rentals.example.com/centretown' }),
    });
    expect(changed.enabled).to.equal(false);
  });

  it('enforces ownership for reads, writes, tests, activation and deletion', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const storage = createMemoryStorage();
    storage.rows.set('owned-by-b', {
      id: 'owned-by-b',
      userId: 'user-b',
      name: 'Private source',
      enabled: false,
      recipe: validRecipe(),
      draftHash: 'x',
    });
    const service = mod.createCustomSourceLifecycleService({
      storage,
      testService: { test: async () => ({ recipeHash: 'e'.repeat(64), activationReady: true }) },
      normalizeAndHash: () => 'e'.repeat(64),
      now: () => 5000,
    });

    expect(() => service.getSource({ userId: 'user-a', sourceId: 'owned-by-b' })).to.throw(mod.CustomSourceOwnershipError);
    expect(() => service.saveDraft({ userId: 'user-a', sourceId: 'owned-by-b', name: 'Hijack', recipe: validRecipe() })).to.throw(
      mod.CustomSourceOwnershipError,
    );
    await service.testSource({ userId: 'user-a', sourceId: 'owned-by-b' }).then(
      () => expect.fail('Expected ownership error'),
      (error) => expect(error).to.be.instanceOf(mod.CustomSourceOwnershipError),
    );
    expect(() => service.setEnabled({ userId: 'user-a', sourceId: 'owned-by-b', enabled: true })).to.throw(
      mod.CustomSourceOwnershipError,
    );
    expect(() => service.removeSource({ userId: 'user-a', sourceId: 'owned-by-b' })).to.throw(
      mod.CustomSourceOwnershipError,
    );
  });
});
