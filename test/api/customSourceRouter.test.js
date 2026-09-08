import { expect } from 'chai';
import { CustomSourceRecipeError } from '../../lib/providers/custom-source/recipe.js';
import { CustomSourceExtractionError, CustomSourceNetworkError } from '../../lib/providers/custom-source/errors.js';
import {
  CustomSourceActivationError,
  CustomSourceNotFoundError,
  CustomSourceOwnershipError,
} from '../../lib/services/customSources/sourceLifecycleService.js';

const loadModule = async () => import('../../lib/api/routes/customSourceRouter.js').catch(() => null);

const response = () => {
  const result = { sent: null };
  result.send = (data, statusCode) => {
    result.sent = { data, statusCode: statusCode ?? 200 };
  };
  return result;
};

const request = ({ body = {}, params = {} } = {}) => ({
  session: { currentUser: 'user-a' },
  body,
  params,
});

describe('Custom Source HTTP boundary', () => {
  it('exports router handlers and typed HTTP error mapping', async () => {
    const mod = await loadModule();
    expect(mod, 'Custom Source router module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.createCustomSourceHandlers).to.be.a('function');
    expect(mod.toCustomSourceHttpError).to.be.a('function');
    expect(mod.customSourceRouter).to.exist;
  });

  it('maps lifecycle, recipe and extractor errors without losing field/step context', async () => {
    const mod = await loadModule();
    if (!mod) return;

    expect(mod.toCustomSourceHttpError(new CustomSourceOwnershipError())).to.deep.include({ status: 403 });
    expect(mod.toCustomSourceHttpError(new CustomSourceNotFoundError())).to.deep.include({ status: 404 });
    expect(mod.toCustomSourceHttpError(new CustomSourceActivationError())).to.deep.include({ status: 409 });

    const recipeError = mod.toCustomSourceHttpError(new CustomSourceRecipeError('selectors.price', 'bad selector'));
    expect(recipeError).to.deep.equal({
      status: 422,
      body: { error: 'CustomSourceRecipeError', message: 'bad selector', field: 'selectors.price' },
    });

    const extractionError = mod.toCustomSourceHttpError(
      new CustomSourceExtractionError('selectors.listing', 'container missing', { step: 'extract' }),
    );
    expect(extractionError).to.deep.equal({
      status: 422,
      body: {
        error: 'CustomSourceExtractionError',
        message: 'container missing',
        field: 'selectors.listing',
        step: 'extract',
      },
    });

    const networkError = mod.toCustomSourceHttpError(
      new CustomSourceNetworkError('upstream failed', { step: 'fetch', status: 503, url: 'https://example.com/' }),
    );
    expect(networkError).to.deep.equal({
      status: 502,
      body: {
        error: 'CustomSourceNetworkError',
        message: 'upstream failed',
        field: 'url',
        step: 'fetch',
        upstreamStatus: 503,
      },
    });
  });

  it('scopes list/save/test/status/delete operations to the authenticated session user', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const calls = [];
    const lifecycle = {
      listSources(input) { calls.push(['list', input]); return [{ id: 'source-1' }]; },
      saveDraft(input) { calls.push(['save', input]); return { id: input.sourceId ?? 'source-new', name: input.name }; },
      async testSource(input) { calls.push(['test', input]); return { activationReady: true, totalRecords: 2 }; },
      setEnabled(input) { calls.push(['status', input]); return { id: input.sourceId, enabled: input.enabled }; },
      removeSource(input) { calls.push(['delete', input]); },
    };
    const handlers = mod.createCustomSourceHandlers({ lifecycle });

    let res = response();
    await handlers.list(request(), res);
    expect(res.sent.data).to.deep.equal([{ id: 'source-1' }]);

    res = response();
    await handlers.save(request({ body: { sourceId: 'source-1', name: 'PM', recipe: { version: 1 } } }), res);
    expect(res.sent.data).to.deep.equal({ id: 'source-1', name: 'PM' });

    res = response();
    await handlers.test(request({ params: { sourceId: 'source-1' } }), res);
    expect(res.sent.data.activationReady).to.equal(true);

    res = response();
    await handlers.setStatus(request({ params: { sourceId: 'source-1' }, body: { enabled: true } }), res);
    expect(res.sent.data).to.deep.equal({ id: 'source-1', enabled: true });

    res = response();
    await handlers.remove(request({ params: { sourceId: 'source-1' } }), res);
    expect(res.sent.data).to.deep.equal({ deleted: true, id: 'source-1' });

    expect(calls).to.deep.equal([
      ['list', { userId: 'user-a' }],
      ['save', { userId: 'user-a', sourceId: 'source-1', name: 'PM', recipe: { version: 1 } }],
      ['test', { userId: 'user-a', sourceId: 'source-1' }],
      ['status', { userId: 'user-a', sourceId: 'source-1', enabled: true }],
      ['delete', { userId: 'user-a', sourceId: 'source-1' }],
    ]);
  });

  it('converts handler failures into JSON responses with useful HTTP status codes', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const handlers = mod.createCustomSourceHandlers({
      lifecycle: {
        listSources() { throw new CustomSourceOwnershipError(); },
        saveDraft() { throw new TypeError('name is required'); },
        testSource() { throw new CustomSourceRecipeError('selectors.title', 'title selector is required'); },
        setEnabled() { throw new CustomSourceActivationError(); },
        removeSource() { throw new CustomSourceNotFoundError(); },
      },
    });

    let res = response();
    await handlers.list(request(), res);
    expect(res.sent.statusCode).to.equal(403);

    res = response();
    await handlers.save(request(), res);
    expect(res.sent).to.deep.equal({
      statusCode: 400,
      data: { error: 'TypeError', message: 'name is required' },
    });

    res = response();
    await handlers.test(request({ params: { sourceId: 'x' } }), res);
    expect(res.sent.statusCode).to.equal(422);
    expect(res.sent.data).to.include({ field: 'selectors.title' });

    res = response();
    await handlers.setStatus(request({ params: { sourceId: 'x' }, body: { enabled: true } }), res);
    expect(res.sent.statusCode).to.equal(409);

    res = response();
    await handlers.remove(request({ params: { sourceId: 'x' } }), res);
    expect(res.sent.statusCode).to.equal(404);
  });
});
