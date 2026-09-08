import { expect } from 'chai';
import { createCanonicalListing } from '../../lib/domain/listing/canonicalListing.js';
import { validateProviderAdapter } from '../../lib/providers/core/index.js';

const loadAdapterModule = async () => import('../../lib/providers/adapters/realtor-ca.js').catch(() => null);

const realtorFixture = (overrides = {}) => ({
  Id: 28123456,
  MlsNumber: 'X1234567',
  RelativeDetailsURL: '/real-estate/28123456/123-bank-street-ottawa-centretown',
  PublicRemarks: 'Bright south-facing rental close to transit.',
  Property: {
    Price: '$2,150/Monthly',
    Type: 'Single Family',
    Address: {
      AddressText: '123 Bank Street|Ottawa, Ontario K1P 1A1',
      Latitude: '45.415',
      Longitude: '-75.695',
    },
    Photo: [
      {
        HighResPath: 'https://cdn.realtor.ca/listing/28123456/high.jpg',
        MedResPath: 'https://cdn.realtor.ca/listing/28123456/medium.jpg',
      },
    ],
  },
  Building: {
    Bedrooms: '2 + 1',
    BathroomTotal: '1.5',
  },
  ...overrides,
});

const makeClient = ({ results = [realtorFixture()] } = {}) => {
  const calls = [];
  return {
    calls,
    async searchRentals(search) {
      calls.push(search);
      return {
        location: 'Ottawa, Ontario',
        results,
        paging: { fetchedPages: 1, totalRecords: results.length, hasMore: false },
      };
    },
  };
};

describe('Realtor.ca provider adapter', () => {
  it('exports a factory that produces a valid stateless provider adapter', async () => {
    const mod = await loadAdapterModule();
    expect(mod, 'Realtor provider adapter module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.createRealtorCaAdapter).to.be.a('function');
    const adapter = mod.createRealtorCaAdapter({ client: makeClient() });
    const metadata = validateProviderAdapter(adapter);

    expect(metadata).to.deep.equal({
      id: 'realtor-ca',
      name: 'Realtor.ca',
      domains: ['realtor.ca'],
      capabilities: {
        discover: true,
        normalize: true,
        fetchDetails: false,
        healthCheck: false,
      },
    });
  });

  it('maps Search Profile v1 fields into RealtorClient rental discovery', async () => {
    const mod = await loadAdapterModule();
    if (!mod) return;

    const client = makeClient({ results: [realtorFixture({ Id: 1 }), realtorFixture({ Id: 2 })] });
    const adapter = mod.createRealtorCaAdapter({ client });
    const discovered = await adapter.discover({
      profile: {
        city: 'Ottawa',
        region: 'ON',
        maxPrice: 2600,
        minBedrooms: 2,
        minBathrooms: 1,
      },
      sourceConfig: {
        minPrice: 1800,
        maxPages: 4,
        recordsPerPage: 25,
      },
    });

    expect(client.calls).to.deep.equal([
      {
        area: 'Ottawa, ON',
        minPrice: 1800,
        maxPrice: 2600,
        minBeds: 2,
        minBaths: 1,
        maxPages: 4,
        recordsPerPage: 25,
      },
    ]);
    expect(discovered.map((item) => item.Id)).to.deep.equal([1, 2]);
  });

  it('allows an explicit source area without mutating shared adapter state', async () => {
    const mod = await loadAdapterModule();
    if (!mod) return;

    const client = makeClient();
    const adapter = mod.createRealtorCaAdapter({ client });

    await adapter.discover({
      profile: { city: 'Ottawa', region: 'ON', maxPrice: 2400 },
      sourceConfig: { area: 'Gatineau, QC', maxPages: 2 },
    });
    await adapter.discover({
      profile: { city: 'Ottawa', region: 'ON', maxPrice: 2200 },
      sourceConfig: { maxPages: 1 },
    });

    expect(client.calls[0].area).to.equal('Gatineau, QC');
    expect(client.calls[1].area).to.equal('Ottawa, ON');
    expect(client.calls[0].maxPrice).to.equal(2400);
    expect(client.calls[1].maxPrice).to.equal(2200);
  });

  it('normalizes a Realtor result into Canonical Listing v1', async () => {
    const mod = await loadAdapterModule();
    if (!mod) return;

    const raw = realtorFixture();
    const adapter = mod.createRealtorCaAdapter({ client: makeClient() });
    const listing = adapter.normalize(raw, { now: 1_700_000_000_000 });

    expect(listing).to.deep.include({
      providerId: 'realtor-ca',
      sourceListingId: '28123456',
      url: 'https://www.realtor.ca/real-estate/28123456/123-bank-street-ottawa-centretown',
      title: '123 Bank Street',
      price: 2150,
      currency: 'CAD',
      beds: 3,
      baths: 1.5,
      address: '123 Bank Street, Ottawa, Ontario K1P 1A1',
      latitude: 45.415,
      longitude: -75.695,
      imageUrl: 'https://cdn.realtor.ca/listing/28123456/high.jpg',
      description: 'Bright south-facing rental close to transit.',
      firstSeen: 1_700_000_000_000,
      lastSeen: 1_700_000_000_000,
    });
    expect(listing.raw).to.deep.equal(raw);
    expect(listing.raw).to.not.equal(raw);
  });

  it('keeps identity stable when mutable Realtor fields change', async () => {
    const mod = await loadAdapterModule();
    if (!mod) return;

    const adapter = mod.createRealtorCaAdapter({ client: makeClient() });
    const first = adapter.normalize(realtorFixture(), { now: 1_000 });
    const repriced = adapter.normalize(
      realtorFixture({
        Property: {
          ...realtorFixture().Property,
          Price: '$2,000/Monthly',
        },
      }),
      { now: 2_000 },
    );

    expect(repriced.price).to.equal(2000);
    expect(repriced.id).to.equal(first.id);
    expect(repriced.sourceListingId).to.equal(first.sourceListingId);
  });

  it('uses MLS identity only as a fallback and accepts absolute detail URLs', async () => {
    const mod = await loadAdapterModule();
    if (!mod) return;

    const adapter = mod.createRealtorCaAdapter({ client: makeClient() });
    const raw = realtorFixture({
      Id: null,
      MlsNumber: 'MLS-FALLBACK',
      RelativeDetailsURL: 'https://www.realtor.ca/real-estate/999/example',
    });
    const listing = adapter.normalize(raw, { now: 5_000 });

    expect(listing.sourceListingId).to.equal('MLS-FALLBACK');
    expect(listing.url).to.equal('https://www.realtor.ca/real-estate/999/example');
  });

  it('fails through the canonical contract when source identity or URL cannot be established', async () => {
    const mod = await loadAdapterModule();
    if (!mod) return;

    const adapter = mod.createRealtorCaAdapter({ client: makeClient() });
    expect(() => adapter.normalize(realtorFixture({ Id: null, MlsNumber: null, RelativeDetailsURL: null })))
      .to.throw()
      .with.property('field', 'sourceListingId');
  });

  it('produces canonical output compatible with provider-independent core consumers', async () => {
    const mod = await loadAdapterModule();
    if (!mod) return;

    const adapter = mod.createRealtorCaAdapter({ client: makeClient() });
    const listing = adapter.normalize(realtorFixture(), { now: 42 });
    const recreated = createCanonicalListing(
      {
        ...listing,
        raw: listing.raw,
      },
      { now: 42 },
    );

    expect(recreated.id).to.equal(listing.id);
    expect(recreated.providerId).to.equal('realtor-ca');
  });
});
