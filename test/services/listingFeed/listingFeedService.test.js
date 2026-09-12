import { expect } from 'chai';

const loadModule = async () => import('../../../lib/services/listingFeed/listingFeedService.js').catch(() => null);

const canonical = (overrides = {}) => ({
  id: 'listing-1',
  providerId: 'realtor-ca',
  sourceListingId: '28123456',
  url: 'https://www.realtor.ca/real-estate/28123456/example',
  title: 'Two bedroom',
  price: 2200,
  currency: 'CAD',
  beds: 2,
  baths: 1,
  address: '123 Bank St',
  latitude: null,
  longitude: null,
  imageUrl: null,
  description: null,
  raw: null,
  firstSeen: 100,
  lastSeen: 100,
  ...overrides,
});

const memoryStorage = () => {
  const listings = new Map();
  const hits = [];
  return {
    listings,
    hits,
    upsertCanonicalListing(item) { listings.set(item.id, item); return item; },
    upsertProfileHit(hit) { hits.push(hit); return hit; },
    queryProfileFeed({ profileId, sort }) {
      return [...listings.values()].map((item) => ({
        profileId,
        listingId: item.id,
        sourceKind: 'provider',
        sourceId: 'realtor-ca',
        sourceLabel: 'Realtor.ca',
        firstSeen: 100,
        lastSeen: 100,
        ...item,
        sort,
      }));
    },
  };
};

describe('Listing Feed service', () => {
  it('exports the feed service and typed access errors', async () => {
    const mod = await loadModule();
    expect(mod, 'Listing Feed service should exist').to.not.equal(null);
    if (!mod) return;
    expect(mod.createListingFeedService).to.be.a('function');
    expect(mod.ListingFeedAccessError).to.be.a('function');
    expect(mod.ListingFeedSourceError).to.be.a('function');
  });

  it('ingests only a source enabled on a Search Profile owned by the current user', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const storage = memoryStorage();
    const searchProfiles = {
      getById(id) {
        if (id !== 'profile-a') return null;
        return {
          id, userId: 'user-a',
          enabledSources: [{ kind: 'provider', id: 'realtor-ca' }],
        };
      },
    };
    const customSources = { getById() { return null; } };
    const service = mod.createListingFeedService({ storage, searchProfileStorage: searchProfiles, customSourceStorage: customSources });

    const result = service.ingest({
      userId: 'user-a',
      profileId: 'profile-a',
      source: { kind: 'provider', id: 'realtor-ca' },
      listings: [canonical()],
      seenAt: 500,
    });

    expect(result).to.deep.equal({ ingested: 1 });
    expect(storage.hits[0]).to.deep.include({
      profileId: 'profile-a',
      listingId: 'listing-1',
      sourceKind: 'provider',
      sourceId: 'realtor-ca',
      sourceLabel: 'Realtor.ca',
      seenAt: 500,
    });

    expect(() => service.ingest({
      userId: 'user-b', profileId: 'profile-a',
      source: { kind: 'provider', id: 'realtor-ca' }, listings: [canonical()], seenAt: 500,
    })).to.throw(mod.ListingFeedAccessError);

    expect(() => service.ingest({
      userId: 'user-a', profileId: 'profile-a',
      source: { kind: 'provider', id: 'other' }, listings: [canonical()], seenAt: 500,
    })).to.throw(mod.ListingFeedSourceError);
  });

  it('requires active owned Custom Sources and matching canonical provider identity', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const storage = memoryStorage();
    const searchProfiles = {
      getById() {
        return {
          id: 'profile-a', userId: 'user-a',
          enabledSources: [{ kind: 'custom-source', id: 'pm-1' }],
        };
      },
    };
    const customSources = {
      getById(id) {
        return id === 'pm-1' ? { id, userId: 'user-a', name: 'Example PM', enabled: true } : null;
      },
    };
    const service = mod.createListingFeedService({ storage, searchProfileStorage: searchProfiles, customSourceStorage: customSources });

    service.ingest({
      userId: 'user-a',
      profileId: 'profile-a',
      source: { kind: 'custom-source', id: 'pm-1' },
      listings: [canonical({ id: 'custom-1', providerId: 'custom-source:pm-1', sourceListingId: 'https://pm/1', url: 'https://pm/1' })],
      seenAt: 700,
    });
    expect(storage.hits[0].sourceLabel).to.equal('Example PM');

    customSources.getById = () => ({ id: 'pm-1', userId: 'user-a', name: 'Example PM', enabled: false });
    expect(() => service.ingest({
      userId: 'user-a',
      profileId: 'profile-a',
      source: { kind: 'custom-source', id: 'pm-1' },
      listings: [canonical({ id: 'custom-2', providerId: 'custom-source:pm-1', sourceListingId: 'https://pm/2', url: 'https://pm/2' })],
      seenAt: 800,
    })).to.throw(mod.ListingFeedSourceError);
  });

  it('queries only an owned Search Profile and passes through supported sort modes', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const storage = memoryStorage();
    storage.listings.set('listing-1', canonical());
    const searchProfiles = {
      getById() { return { id: 'profile-a', userId: 'user-a', enabledSources: [] }; },
    };
    const service = mod.createListingFeedService({
      storage,
      searchProfileStorage: searchProfiles,
      customSourceStorage: { getById() { return null; } },
    });

    const rows = service.query({ userId: 'user-a', profileId: 'profile-a', sort: 'price-desc' });
    expect(rows[0].sort).to.equal('price-desc');
    expect(() => service.query({ userId: 'user-b', profileId: 'profile-a', sort: 'newest' })).to.throw(mod.ListingFeedAccessError);
    expect(() => service.query({ userId: 'user-a', profileId: 'profile-a', sort: 'bogus' })).to.throw(TypeError);
  });
});
