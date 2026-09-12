import { expect } from 'chai';
import {
  ListingFeedAccessError,
  ListingFeedSourceError,
} from '../../lib/services/listingFeed/listingFeedService.js';

const loadModule = async () => import('../../lib/api/routes/listingFeedRouter.js').catch(() => null);

const response = () => {
  const result = { sent: null };
  result.send = (data, statusCode) => {
    result.sent = { data, statusCode: statusCode ?? 200 };
  };
  return result;
};

const request = ({ query = {}, currentUser = 'user-a' } = {}) => ({
  session: { currentUser },
  query,
});

describe('Listing Feed HTTP boundary', () => {
  it('exports router handlers and typed HTTP error mapping', async () => {
    const mod = await loadModule();
    expect(mod, 'Listing Feed router module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.createListingFeedHandlers).to.be.a('function');
    expect(mod.toListingFeedHttpError).to.be.a('function');
    expect(mod.listingFeedRouter).to.exist;
  });

  it('maps access, source and validation errors without leaking internals', async () => {
    const mod = await loadModule();
    if (!mod) return;

    expect(mod.toListingFeedHttpError(new ListingFeedAccessError())).to.deep.include({ status: 403 });
    expect(mod.toListingFeedHttpError(new ListingFeedSourceError())).to.deep.include({ status: 409 });
    expect(mod.toListingFeedHttpError(new TypeError('sort is invalid'))).to.deep.equal({
      status: 400,
      body: { error: 'TypeError', message: 'sort is invalid' },
    });
    expect(mod.toListingFeedHttpError(new Error('database exploded'))).to.deep.equal({
      status: 500,
      body: { error: 'InternalServerError', message: 'Listing Feed request failed' },
    });
  });

  it('scopes feed queries to the authenticated user and requested profile', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const calls = [];
    const service = {
      query(input) {
        calls.push(input);
        return [{ listingId: 'listing-1', sourceLabel: 'Realtor.ca' }];
      },
    };
    const handlers = mod.createListingFeedHandlers({ service });

    const res = response();
    await handlers.list(request({ query: { profileId: 'profile-a', sort: 'price-asc' } }), res);

    expect(res.sent).to.deep.equal({
      statusCode: 200,
      data: [{ listingId: 'listing-1', sourceLabel: 'Realtor.ca' }],
    });
    expect(calls).to.deep.equal([
      { userId: 'user-a', profileId: 'profile-a', sort: 'price-asc' },
    ]);
  });

  it('defaults to newest and converts failures into JSON responses', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const calls = [];
    const handlers = mod.createListingFeedHandlers({
      service: {
        query(input) {
          calls.push(input);
          if (input.profileId === 'foreign') throw new ListingFeedAccessError();
          if (input.profileId === 'bad') throw new TypeError('profileId is required');
          return [];
        },
      },
    });

    let res = response();
    await handlers.list(request({ query: { profileId: 'profile-a' } }), res);
    expect(calls[0].sort).to.equal('newest');

    res = response();
    await handlers.list(request({ query: { profileId: 'foreign' } }), res);
    expect(res.sent.statusCode).to.equal(403);

    res = response();
    await handlers.list(request({ query: { profileId: 'bad' } }), res);
    expect(res.sent).to.deep.equal({
      statusCode: 400,
      data: { error: 'TypeError', message: 'profileId is required' },
    });
  });
});
