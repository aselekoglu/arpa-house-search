import { expect } from 'chai';

const loadModule = async () => import('../../../lib/services/searchProfiles/searchProfileLifecycleService.js').catch(() => null);

const createMemoryStorage = () => {
  const rows = new Map();
  const calls = { upsert: [], remove: [] };
  return {
    rows,
    calls,
    getById(id) {
      return rows.get(id) ?? null;
    },
    listByUser(userId) {
      return [...rows.values()].filter((row) => row.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    upsert(profile) {
      calls.upsert.push(profile);
      rows.set(profile.id, profile);
      return rows.get(profile.id);
    },
    remove(id) {
      calls.remove.push(id);
      rows.delete(id);
    },
  };
};

const createCustomSourceStorage = (rows = [
  { id: 'source-1', userId: 'user-a', enabled: true },
]) => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    getById(id) {
      return byId.get(id) ?? null;
    },
  };
};

const profileFields = (overrides = {}) => ({
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
  ...overrides,
});

describe('Search Profile lifecycle service', () => {
  it('exports the lifecycle factory and typed ownership/not-found errors', async () => {
    const mod = await loadModule();
    expect(mod, 'Search Profile lifecycle service module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.createSearchProfileLifecycleService).to.be.a('function');
    expect(mod.SearchProfileOwnershipError).to.be.a('function');
    expect(mod.SearchProfileNotFoundError).to.be.a('function');
  });

  it('creates a validated user-owned profile with generated identity and timestamps', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const storage = createMemoryStorage();
    const service = mod.createSearchProfileLifecycleService({
      storage,
      customSourceStorage: createCustomSourceStorage(),
      idFactory: () => 'profile-1',
      now: () => 1000,
    });

    const saved = service.saveProfile({ userId: 'user-a', ...profileFields() });
    expect(saved).to.deep.include({
      id: 'profile-1', userId: 'user-a', name: 'Ottawa 2BR', city: 'Ottawa', region: 'ON', createdAt: 1000, updatedAt: 1000,
    });
    expect(saved.enabledSources).to.deep.equal(profileFields().enabledSources);
    expect(saved.schedule).to.deep.equal({ enabled: true, intervalMinutes: 15 });
    expect(storage.calls.upsert).to.have.length(1);
  });

  it('updates an owned profile while preserving owner and createdAt', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const storage = createMemoryStorage();
    storage.rows.set('profile-2', {
      id: 'profile-2', userId: 'user-a', ...profileFields({ name: 'Before' }), createdAt: 500, updatedAt: 500,
    });
    let clock = 900;
    const service = mod.createSearchProfileLifecycleService({
      storage,
      customSourceStorage: createCustomSourceStorage(),
      now: () => clock++,
    });

    const updated = service.saveProfile({
      userId: 'user-a',
      profileId: 'profile-2',
      ...profileFields({ name: 'After', maxPrice: 2600 }),
    });

    expect(updated).to.deep.include({
      id: 'profile-2', userId: 'user-a', name: 'After', maxPrice: 2600, createdAt: 500, updatedAt: 900,
    });
  });

  it('lists, gets and deletes only profiles owned by the current user', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const storage = createMemoryStorage();
    storage.rows.set('a-1', { id: 'a-1', userId: 'user-a', ...profileFields({ name: 'A' }), createdAt: 1, updatedAt: 10 });
    storage.rows.set('b-1', { id: 'b-1', userId: 'user-b', ...profileFields({ name: 'B' }), createdAt: 1, updatedAt: 20 });
    const service = mod.createSearchProfileLifecycleService({
      storage,
      customSourceStorage: createCustomSourceStorage(),
      now: () => 30,
    });

    expect(service.listProfiles({ userId: 'user-a' }).map((profile) => profile.id)).to.deep.equal(['a-1']);
    expect(service.getProfile({ userId: 'user-a', profileId: 'a-1' }).id).to.equal('a-1');
    service.removeProfile({ userId: 'user-a', profileId: 'a-1' });
    expect(storage.getById('a-1')).to.equal(null);
    expect(storage.getById('b-1')).to.not.equal(null);
  });

  it('rejects cross-user reads, updates and deletes', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const storage = createMemoryStorage();
    storage.rows.set('owned-by-b', {
      id: 'owned-by-b', userId: 'user-b', ...profileFields({ name: 'Private' }), createdAt: 100, updatedAt: 100,
    });
    const service = mod.createSearchProfileLifecycleService({
      storage,
      customSourceStorage: createCustomSourceStorage(),
      now: () => 200,
    });

    expect(() => service.getProfile({ userId: 'user-a', profileId: 'owned-by-b' })).to.throw(mod.SearchProfileOwnershipError);
    expect(() => service.saveProfile({ userId: 'user-a', profileId: 'owned-by-b', ...profileFields({ name: 'Hijack' }) })).to.throw(
      mod.SearchProfileOwnershipError,
    );
    expect(() => service.removeProfile({ userId: 'user-a', profileId: 'owned-by-b' })).to.throw(mod.SearchProfileOwnershipError);
  });

  it('rejects Custom Source references that are missing or owned by another user', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const service = mod.createSearchProfileLifecycleService({
      storage: createMemoryStorage(),
      customSourceStorage: createCustomSourceStorage([
        { id: 'source-1', userId: 'user-a', enabled: true },
        { id: 'source-b', userId: 'user-b', enabled: true },
      ]),
      idFactory: () => 'profile-secure',
      now: () => 400,
    });

    expect(() => service.saveProfile({
      userId: 'user-a',
      ...profileFields({ enabledSources: [{ kind: 'custom-source', id: 'source-b' }] }),
    })).to.throw(mod.SearchProfileOwnershipError, /Custom Source/);

    expect(() => service.saveProfile({
      userId: 'user-a',
      ...profileFields({ enabledSources: [{ kind: 'custom-source', id: 'missing-source' }] }),
    })).to.throw(mod.SearchProfileOwnershipError, /Custom Source/);
  });

  it('distinguishes missing profiles and validates every save through the domain contract', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const service = mod.createSearchProfileLifecycleService({
      storage: createMemoryStorage(),
      customSourceStorage: createCustomSourceStorage(),
      idFactory: () => 'profile-x',
      now: () => 500,
    });
    expect(() => service.getProfile({ userId: 'user-a', profileId: 'missing' })).to.throw(mod.SearchProfileNotFoundError);
    expect(() => service.removeProfile({ userId: 'user-a', profileId: 'missing' })).to.throw(mod.SearchProfileNotFoundError);
    expect(() => service.saveProfile({ userId: 'user-a', ...profileFields({ schedule: { enabled: true, intervalMinutes: 0 } }) })).to.throw(
      /intervalMinutes/,
    );
    expect(() => service.saveProfile({ userId: 'user-a', ...profileFields({ enabledSources: [
      { kind: 'provider', id: 'realtor-ca' },
      { kind: 'provider', id: 'realtor-ca' },
    ] }) })).to.throw(/duplicate source/);
  });
});
