import { expect } from 'chai';
import {
  SearchProfileNotFoundError,
  SearchProfileOwnershipError,
} from '../../lib/services/searchProfiles/searchProfileLifecycleService.js';

const loadModule = async () => import('../../lib/api/routes/searchProfileRouter.js').catch(() => null);

const response = () => {
  const result = { sent: null };
  result.send = (data, statusCode) => {
    result.sent = { data, statusCode: statusCode ?? 200 };
  };
  return result;
};

const request = ({ body = {}, params = {}, currentUser = 'user-a' } = {}) => ({
  session: { currentUser },
  body,
  params,
});

const profileBody = (overrides = {}) => ({
  name: 'Ottawa 2BR',
  city: 'Ottawa',
  region: 'ON',
  maxPrice: 2400,
  minBedrooms: 2,
  minBathrooms: 1,
  enabledSources: [{ kind: 'provider', id: 'realtor-ca' }],
  schedule: { enabled: true, intervalMinutes: 15 },
  ...overrides,
});

describe('Search Profile HTTP boundary', () => {
  it('exports router handlers and typed HTTP error mapping', async () => {
    const mod = await loadModule();
    expect(mod, 'Search Profile router module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.createSearchProfileHandlers).to.be.a('function');
    expect(mod.toSearchProfileHttpError).to.be.a('function');
    expect(mod.searchProfileRouter).to.exist;
  });

  it('maps lifecycle and validation errors without leaking internals', async () => {
    const mod = await loadModule();
    if (!mod) return;

    expect(mod.toSearchProfileHttpError(new SearchProfileOwnershipError())).to.deep.include({ status: 403 });
    expect(mod.toSearchProfileHttpError(new SearchProfileNotFoundError())).to.deep.include({ status: 404 });
    expect(mod.toSearchProfileHttpError(new TypeError('schedule.intervalMinutes must be valid'))).to.deep.equal({
      status: 400,
      body: { error: 'TypeError', message: 'schedule.intervalMinutes must be valid' },
    });
    expect(mod.toSearchProfileHttpError(new Error('database exploded'))).to.deep.equal({
      status: 500,
      body: { error: 'InternalServerError', message: 'Search Profile request failed' },
    });
  });

  it('scopes CRUD and execution-context operations to the authenticated user', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const calls = [];
    const stored = { id: 'profile-1', userId: 'user-a', ...profileBody() };
    const lifecycle = {
      listProfiles(input) { calls.push(['list', input]); return [stored]; },
      saveProfile(input) { calls.push(['save', input]); return { ...stored, ...input, id: input.profileId ?? stored.id }; },
      getProfile(input) { calls.push(['get', input]); return stored; },
      removeProfile(input) { calls.push(['delete', input]); },
    };
    const contextMapper = (profile) => {
      calls.push(['context', profile.id]);
      return { profile: { id: profile.id, city: profile.city }, enabledSources: profile.enabledSources, schedule: profile.schedule };
    };
    const handlers = mod.createSearchProfileHandlers({ lifecycle, contextMapper });

    let res = response();
    await handlers.list(request(), res);
    expect(res.sent.data).to.deep.equal([stored]);

    res = response();
    await handlers.save(request({ body: { profileId: 'profile-1', ...profileBody({ maxPrice: 2600 }) } }), res);
    expect(res.sent.data.maxPrice).to.equal(2600);

    res = response();
    await handlers.executionContext(request({ params: { profileId: 'profile-1' } }), res);
    expect(res.sent.data).to.deep.equal({
      profile: { id: 'profile-1', city: 'Ottawa' },
      enabledSources: [{ kind: 'provider', id: 'realtor-ca' }],
      schedule: { enabled: true, intervalMinutes: 15 },
    });

    res = response();
    await handlers.remove(request({ params: { profileId: 'profile-1' } }), res);
    expect(res.sent.data).to.deep.equal({ deleted: true, id: 'profile-1' });

    expect(calls).to.deep.equal([
      ['list', { userId: 'user-a' }],
      ['save', { userId: 'user-a', profileId: 'profile-1', ...profileBody({ maxPrice: 2600 }) }],
      ['get', { userId: 'user-a', profileId: 'profile-1' }],
      ['context', 'profile-1'],
      ['delete', { userId: 'user-a', profileId: 'profile-1' }],
    ]);
  });

  it('converts handler failures into useful JSON responses', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const handlers = mod.createSearchProfileHandlers({
      lifecycle: {
        listProfiles() { throw new SearchProfileOwnershipError(); },
        saveProfile() { throw new TypeError('name must be a non-empty string'); },
        getProfile() { throw new SearchProfileNotFoundError(); },
        removeProfile() { throw new SearchProfileNotFoundError(); },
      },
      contextMapper: () => { throw new Error('not reached'); },
    });

    let res = response();
    await handlers.list(request(), res);
    expect(res.sent.statusCode).to.equal(403);

    res = response();
    await handlers.save(request({ body: profileBody({ name: '' }) }), res);
    expect(res.sent).to.deep.equal({
      statusCode: 400,
      data: { error: 'TypeError', message: 'name must be a non-empty string' },
    });

    res = response();
    await handlers.executionContext(request({ params: { profileId: 'missing' } }), res);
    expect(res.sent.statusCode).to.equal(404);

    res = response();
    await handlers.remove(request({ params: { profileId: 'missing' } }), res);
    expect(res.sent.statusCode).to.equal(404);
  });
});
