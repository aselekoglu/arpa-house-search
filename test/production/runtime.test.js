import { expect } from 'chai';
import { hash } from '../../lib/services/security/hash.js';

const loadModule = async () => import('../../lib/production/runtime.js').catch(() => null);

describe('production M1 runtime', () => {
  it('authenticates the owner and returns the same user identity', async () => {
    const mod = await loadModule();
    expect(mod, 'production runtime should exist').to.not.equal(null);
    if (!mod) return;

    let touched = null;
    const user = {
      id: 'owner-1',
      username: 'arpa-owner',
      password_hash: hash('correct-horse'),
      is_admin: true,
      last_login: null,
    };
    const store = {
      async getUserByUsername(username) { return username === user.username ? user : null; },
      async getUserById(id) { return id === user.id ? user : null; },
      async touchUserLogin(id, now) { touched = { id, now }; },
    };

    const runtime = mod.createProductionRuntime({ store, now: () => 1234 });
    expect(await runtime.authenticate('arpa-owner', 'wrong')).to.equal(null);
    expect(await runtime.authenticate('arpa-owner', 'correct-horse')).to.deep.equal({
      userId: 'owner-1',
      isAdmin: true,
    });
    expect(touched).to.deep.equal({ id: 'owner-1', now: 1234 });
    expect(await runtime.currentUser('owner-1')).to.deep.equal({
      userId: 'owner-1',
      isAdmin: true,
    });
  });

  it('creates a Search Profile with monotonic timestamps and validates Custom Source ownership', async () => {
    const mod = await loadModule();
    if (!mod) return;

    let saved = null;
    const store = {
      async getProfile() { return null; },
      async getSource(id) {
        if (id === 'owned') return { id, userId: 'owner-1', enabled: true, recipe: {} };
        if (id === 'foreign') return { id, userId: 'other-user', enabled: true, recipe: {} };
        return null;
      },
      async saveProfile(profile) { saved = profile; return profile; },
    };

    const runtime = mod.createProductionRuntime({ store, now: () => 5000 });
    const profile = await runtime.saveProfile('owner-1', {
      name: 'Ottawa rentals',
      city: 'Ottawa',
      region: 'ON',
      maxPrice: 2500,
      minBedrooms: 1,
      minBathrooms: 1,
      enabledSources: [
        { kind: 'provider', id: 'realtor-ca' },
        { kind: 'custom-source', id: 'owned' },
      ],
      schedule: { enabled: true, intervalMinutes: 15 },
    });

    expect(profile.createdAt).to.equal(5000);
    expect(profile.updatedAt).to.equal(5000);
    expect(saved.userId).to.equal('owner-1');
    expect(saved.enabledSources).to.deep.equal([
      { kind: 'provider', id: 'realtor-ca' },
      { kind: 'custom-source', id: 'owned' },
    ]);

    let error;
    try {
      await runtime.saveProfile('owner-1', {
        name: 'Bad profile',
        enabledSources: [{ kind: 'custom-source', id: 'foreign' }],
        schedule: { enabled: false, intervalMinutes: 15 },
      });
    } catch (cause) {
      error = cause;
    }
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('Custom Source not found');
  });
});
