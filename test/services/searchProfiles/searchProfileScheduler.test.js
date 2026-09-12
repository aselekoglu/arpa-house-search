import { expect } from 'chai';

const loadModule = async () =>
  import('../../../lib/services/searchProfiles/searchProfileScheduler.js').catch(() => null);

const scheduledProfile = (overrides = {}) => ({
  id: 'profile-a',
  userId: 'user-a',
  schedule: { enabled: true, intervalMinutes: 15 },
  ...overrides,
});

describe('Search Profile scheduler', () => {
  it('exports a scheduler with deterministic due calculation', async () => {
    const mod = await loadModule();
    expect(mod, 'Search Profile scheduler should exist').to.not.equal(null);
    if (!mod) return;
    expect(mod.createSearchProfileScheduler).to.be.a('function');
    expect(mod.isSearchProfileDue).to.be.a('function');

    const fifteenMinutes = 15 * 60 * 1000;
    expect(mod.isSearchProfileDue({
      profile: scheduledProfile(),
      latestRun: null,
      now: 1_000,
    })).to.equal(true);
    expect(mod.isSearchProfileDue({
      profile: scheduledProfile(),
      latestRun: { startedAt: 1_000 },
      now: 1_000 + fifteenMinutes - 1,
    })).to.equal(false);
    expect(mod.isSearchProfileDue({
      profile: scheduledProfile(),
      latestRun: { startedAt: 1_000 },
      now: 1_000 + fifteenMinutes,
    })).to.equal(true);
    expect(mod.isSearchProfileDue({
      profile: scheduledProfile({ schedule: { enabled: false, intervalMinutes: 15 } }),
      latestRun: null,
      now: 1_000,
    })).to.equal(false);
  });

  it('runs only due profiles through the shared executor with scheduled trigger', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const calls = [];
    const scheduler = mod.createSearchProfileScheduler({
      searchProfileStorage: {
        listScheduled() {
          return [
            scheduledProfile({ id: 'due', userId: 'user-a' }),
            scheduledProfile({ id: 'recent', userId: 'user-b' }),
          ];
        },
      },
      runStorage: {
        getLatestRun(profileId) {
          if (profileId === 'recent') return { startedAt: 950_000 };
          return null;
        },
      },
      executionService: {
        async execute(input) {
          calls.push(input);
          return { id: `run-${input.profileId}`, status: 'completed' };
        },
      },
      now: () => 1_000_000,
    });

    const result = await scheduler.tick();

    expect(calls).to.deep.equal([
      { userId: 'user-a', profileId: 'due', trigger: 'scheduled' },
    ]);
    expect(result).to.deep.equal({
      checked: 2,
      due: 1,
      completed: 1,
      failed: 0,
      runs: [{ profileId: 'due', runId: 'run-due', status: 'completed' }],
    });
  });

  it('isolates a profile execution failure and continues other due profiles', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const calls = [];
    const scheduler = mod.createSearchProfileScheduler({
      searchProfileStorage: {
        listScheduled() {
          return [
            scheduledProfile({ id: 'broken', userId: 'user-a' }),
            scheduledProfile({ id: 'healthy', userId: 'user-b' }),
          ];
        },
      },
      runStorage: { getLatestRun() { return null; } },
      executionService: {
        async execute(input) {
          calls.push(input.profileId);
          if (input.profileId === 'broken') throw new Error('boom');
          return { id: 'run-healthy', status: 'completed' };
        },
      },
      now: () => 2_000_000,
    });

    const result = await scheduler.tick();
    expect(calls).to.deep.equal(['broken', 'healthy']);
    expect(result.checked).to.equal(2);
    expect(result.due).to.equal(2);
    expect(result.completed).to.equal(1);
    expect(result.failed).to.equal(1);
    expect(result.runs).to.deep.equal([
      { profileId: 'broken', runId: null, status: 'failed', error: 'boom' },
      { profileId: 'healthy', runId: 'run-healthy', status: 'completed' },
    ]);
  });
});
