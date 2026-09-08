import { readFileSync } from 'node:fs';
import { expect } from 'chai';
import { RealtorClient, RealtorResponseError } from '../../lib/clients/realtor/index.js';
import { createRealtorCaAdapter } from '../../lib/providers/adapters/realtor-ca.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./realtor/${name}`, import.meta.url), 'utf8'));

const clone = (value) => structuredClone(value);

const makeTransport = (responses) => {
  const queue = responses.map(clone);
  const calls = [];
  return {
    calls,
    async request(request) {
      calls.push(request);
      if (queue.length === 0) throw new Error('Unexpected transport request');
      return queue.shift();
    },
  };
};

describe('Realtor.ca offline fixtures', () => {
  it('keeps representative source fixtures checked in and parseable', () => {
    const geocode = fixture('geocode-ottawa.json');
    const normal = fixture('listing-normal.json');
    const missing = fixture('listing-missing-fields.json');
    const page1 = fixture('search-page-1.json');
    const page2 = fixture('search-page-2.json');
    const malformed = fixture('search-malformed.json');

    expect(geocode.SubArea?.[0]?.Location).to.equal('Ottawa, Ontario');
    expect(normal).to.have.nested.property('Property.Price');
    expect(missing).to.have.property('Id');
    expect(page1.Results).to.be.an('array').with.length.greaterThan(0);
    expect(page2.Results).to.be.an('array').with.length.greaterThan(0);
    expect(malformed).to.not.have.property('Results');
  });

  it('normalizes a representative Realtor listing from a checked-in fixture', () => {
    const adapter = createRealtorCaAdapter({ client: { async searchRentals() {} } });
    const raw = fixture('listing-normal.json');
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
    });
  });

  it('normalizes optional missing fields to null without losing source identity', () => {
    const adapter = createRealtorCaAdapter({ client: { async searchRentals() {} } });
    const listing = adapter.normalize(fixture('listing-missing-fields.json'), { now: 42 });

    expect(listing).to.deep.include({
      providerId: 'realtor-ca',
      sourceListingId: '28129999',
      url: 'https://www.realtor.ca/real-estate/28129999/missing-fields-example',
      price: 1995,
      beds: null,
      baths: null,
      latitude: null,
      longitude: null,
      imageUrl: null,
      description: null,
    });
    expect(listing.address).to.equal('456 Somerset Street West, Ottawa, Ontario K2P 0J8');
  });

  it('uses checked-in response pages to prove bounded pagination deterministically', async () => {
    const transport = makeTransport([
      fixture('geocode-ottawa.json'),
      fixture('search-page-1.json'),
      fixture('search-page-2.json'),
    ]);
    const client = new RealtorClient({ transport });

    const result = await client.searchRentals({
      area: 'Ottawa, ON',
      maxPages: 2,
      recordsPerPage: 2,
    });

    expect(result.results.map((item) => item.Id)).to.deep.equal([28123456, 28129999, 28130001, 28130002]);
    expect(result.paging).to.deep.equal({ fetchedPages: 2, totalRecords: 8, hasMore: true });
    expect(transport.calls.filter((call) => call.path.includes('AsyncPropertySearch_Post'))).to.have.length(2);
  });

  it('uses a checked-in malformed response to prove explicit response errors', async () => {
    const client = new RealtorClient({
      transport: makeTransport([fixture('geocode-ottawa.json'), fixture('search-malformed.json')]),
    });

    try {
      await client.searchRentals({ area: 'Ottawa, ON' });
      expect.fail('Expected malformed fixture to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(RealtorResponseError);
      expect(error.code).to.equal('REALTOR_RESPONSE');
    }
  });
});
