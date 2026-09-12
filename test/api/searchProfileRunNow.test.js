import { expect } from 'chai';
import {
  SearchProfileExecutionAccessError,
  SearchProfileRunInProgressError,
} from '../../lib/services/searchProfiles/searchProfileExecutionService.js';

const loadModule = async () => import('../../lib/api/routes/searchProfileRouter.js').catch(() => null);

const response = () => {
  const result = { sent: null };
  result.send = (data, statusCode) => {
    result.sent = { data, statusCode: statusCode ?? 200 };
  };
  return result;
};

describe('Search Profile Run Now API', () => {
  it('maps execution access and concurrency errors without leaking internals', async () => {
    const mod = await loadModule();
    expect(mod, 'Search Profile router should load').to.not.equal(null);
    if (!mod) return;

    expect(mod.toSearchProfileHttpError(new SearchProfileExecutionAccessError())).to.deep.include({ status: 403 });
    expect(mod.toSearchProfileHttpError(new SearchProfileRunInProgressError())).to.deep.include({ status: 409 });
  });

  it('runs the persisted profile through the shared execution service', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const calls = [];
    const handlers = mod.createSearchProfileHandlers({
      lifecycle: {
        listProfiles() { return []; },
        saveProfile() { return {}; },
        getProfile() { return {}; },
        removeProfile() {},
      },
      executionService: {
        async execute(input) {
          calls.push(input);
          return { id: 'run-1', status: 'completed', sources: [] };
        },
      },
    });

    const res = response();
    await handlers.runNow(
      {
        session: { currentUser: 'user-a' },
        params: { profileId: 'profile-a' },
      },
      res,
    );

    expect(calls).to.deep.equal([
      { userId: 'user-a', profileId: 'profile-a', trigger: 'manual' },
    ]);
    expect(res.sent).to.deep.equal({
      statusCode: 200,
      data: { id: 'run-1', status: 'completed', sources: [] },
    });
  });
});
