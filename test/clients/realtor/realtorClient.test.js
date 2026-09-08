import { expect } from 'chai';

const loadRealtorModule = async () => import('../../../lib/clients/realtor/index.js').catch(() => null);

const makeSearchPayload = ({ ids = [], totalRecords = ids.length } = {}) => ({
  Results: ids.map((id) => ({ Id: id, MlsNumber: `MLS-${id}` })),
  Paging: { TotalRecords: totalRecords },
});

const makeTransport = (responses = []) => {
  const calls = [];
  return {
    calls,
    async request(request) {
      calls.push(request);
      if (responses.length === 0) throw new Error('Unexpected transport request');
      const next = responses.shift();
      return typeof next === 'function' ? next(request) : next;
    },
    async close() {},
  };
};

describe('Realtor.ca client', () => {
  it('exports the Realtor client and browser transport contract', async () => {
    const mod = await loadRealtorModule();
    expect(mod, 'Realtor client module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.RealtorClient).to.be.a('function');
    expect(mod.RealtorBrowserTransport).to.be.a('function');
    expect(mod.RealtorError).to.be.a('function');
    expect(mod.RealtorChallengeError).to.be.a('function');
    expect(mod.RealtorLocationError).to.be.a('function');
    expect(mod.RealtorResponseError).to.be.a('function');
  });

  it('geocodes Ottawa and searches rentals with current Realtor endpoint semantics', async () => {
    const mod = await loadRealtorModule();
    if (!mod) return;

    const transport = makeTransport([
      {
        SubArea: [
          {
            Location: 'Ottawa, Ontario',
            GEOId: 'g30_d2c8',
            Viewport: {
              NorthEast: { Latitude: 45.55, Longitude: -75.35 },
              SouthWest: { Latitude: 45.2, Longitude: -76.0 },
            },
          },
        ],
      },
      makeSearchPayload({ ids: [101, 102], totalRecords: 2 }),
    ]);
    const client = new mod.RealtorClient({ transport });

    const result = await client.searchRentals({
      area: 'Ottawa, ON',
      minPrice: 1800,
      maxPrice: 2600,
      minBeds: 2,
      minBaths: 1,
      maxPages: 3,
      recordsPerPage: 20,
    });

    expect(transport.calls).to.have.length(2);
    expect(transport.calls[0]).to.deep.include({
      method: 'GET',
      path: '/Location.svc/SubAreaSearch',
    });
    expect(transport.calls[0].query).to.deep.include({
      Area: 'Ottawa, ON',
      CurrentPage: '1',
      ApplicationId: '1',
      CultureId: '1',
      Version: '7.0',
    });

    expect(transport.calls[1]).to.deep.include({
      method: 'POST',
      path: '/Listing.svc/AsyncPropertySearch_Post',
    });
    expect(transport.calls[1].form).to.deep.include({
      PropertyTypeGroupID: '1',
      TransactionTypeId: '3',
      PropertySearchTypeId: '0',
      Sort: '6-D',
      Currency: 'CAD',
      IncludeHiddenListings: 'false',
      RecordsPerPage: '20',
      CurrentPage: '1',
      GeoIds: 'g30_d2c8',
      LatitudeMax: '45.55',
      LongitudeMax: '-75.35',
      LatitudeMin: '45.2',
      LongitudeMin: '-76',
      RentMin: '1800',
      RentMax: '2600',
      BedRange: '2-0',
      BathRange: '1-0',
    });

    expect(result.location).to.equal('Ottawa, Ontario');
    expect(result.results.map((item) => item.Id)).to.deep.equal([101, 102]);
    expect(result.paging).to.deep.equal({ fetchedPages: 1, totalRecords: 2, hasMore: false });
  });

  it('bounds pagination even when Realtor reports more records', async () => {
    const mod = await loadRealtorModule();
    if (!mod) return;

    const transport = makeTransport([
      {
        SubArea: [
          {
            Location: 'Ottawa, Ontario',
            GEOId: 'g30_d2c8',
            Viewport: {
              NorthEast: { Latitude: 45.55, Longitude: -75.35 },
              SouthWest: { Latitude: 45.2, Longitude: -76.0 },
            },
          },
        ],
      },
      makeSearchPayload({ ids: [1, 2], totalRecords: 100 }),
      makeSearchPayload({ ids: [3, 4], totalRecords: 100 }),
    ]);
    const client = new mod.RealtorClient({ transport });

    const result = await client.searchRentals({ area: 'Ottawa, ON', maxPages: 2, recordsPerPage: 2 });

    expect(result.results.map((item) => item.Id)).to.deep.equal([1, 2, 3, 4]);
    expect(result.paging).to.deep.equal({ fetchedPages: 2, totalRecords: 100, hasMore: true });
    expect(transport.calls.filter((call) => call.path.includes('AsyncPropertySearch_Post'))).to.have.length(2);
    expect(transport.calls.at(-1).form.CurrentPage).to.equal('2');
  });

  it('rejects invalid bounds before making requests', async () => {
    const mod = await loadRealtorModule();
    if (!mod) return;

    const transport = makeTransport();
    const client = new mod.RealtorClient({ transport });

    const invalidSearches = [
      { area: '', expectedField: 'area' },
      { area: 'Ottawa', minPrice: -1, expectedField: 'minPrice' },
      { area: 'Ottawa', minPrice: 2500, maxPrice: 2000, expectedField: 'priceRange' },
      { area: 'Ottawa', minBeds: 1.5, expectedField: 'minBeds' },
      { area: 'Ottawa', maxPages: 0, expectedField: 'maxPages' },
      { area: 'Ottawa', recordsPerPage: 101, expectedField: 'recordsPerPage' },
    ];

    for (const { expectedField, ...search } of invalidSearches) {
      try {
        await client.searchRentals(search);
        expect.fail(`Expected ${expectedField} validation to fail`);
      } catch (error) {
        expect(error).to.be.instanceOf(mod.RealtorError);
        expect(error.field).to.equal(expectedField);
      }
    }
    expect(transport.calls).to.have.length(0);
  });

  it('fails explicitly when geocoding or response payloads are unusable', async () => {
    const mod = await loadRealtorModule();
    if (!mod) return;

    const missingLocation = new mod.RealtorClient({ transport: makeTransport([{ SubArea: [] }]) });
    try {
      await missingLocation.searchRentals({ area: 'Nowhere, ON' });
      expect.fail('Expected location error');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.RealtorLocationError);
    }

    const malformedSearch = new mod.RealtorClient({
      transport: makeTransport([
        {
          SubArea: [
            {
              Location: 'Ottawa, Ontario',
              GEOId: 'g30_d2c8',
              Viewport: {
                NorthEast: { Latitude: 45.55, Longitude: -75.35 },
                SouthWest: { Latitude: 45.2, Longitude: -76.0 },
              },
            },
          ],
        },
        { Paging: { TotalRecords: 3 } },
      ]),
    });
    try {
      await malformedSearch.searchRentals({ area: 'Ottawa, ON' });
      expect.fail('Expected response error');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.RealtorResponseError);
    }
  });

  it('uses a persistent browser profile and browser-context fetch without challenge bypass', async () => {
    const mod = await loadRealtorModule();
    if (!mod) return;

    const launchCalls = [];
    const evaluateCalls = [];
    const page = {
      async goto() {
        return { status: () => 200 };
      },
      async title() {
        return 'REALTOR.ca';
      },
      async content() {
        return '<html><body>REALTOR.ca</body></html>';
      },
      url() {
        return 'https://www.realtor.ca/';
      },
      async evaluate(_fn, args) {
        evaluateCalls.push(args);
        return {
          status: 200,
          contentType: 'application/json; charset=utf-8',
          text: JSON.stringify({ SubArea: [] }),
        };
      },
      async close() {},
    };
    const browser = {
      async newPage() {
        return page;
      },
      async close() {},
    };
    const puppeteer = {
      async launch(options) {
        launchCalls.push(options);
        return browser;
      },
    };

    const transport = new mod.RealtorBrowserTransport({
      puppeteer,
      userDataDir: '/tmp/arpa-realtor-profile',
      headless: true,
    });
    const payload = await transport.request({
      method: 'GET',
      path: '/Location.svc/SubAreaSearch',
      query: { Area: 'Ottawa, ON' },
    });

    expect(payload).to.deep.equal({ SubArea: [] });
    expect(launchCalls).to.have.length(1);
    expect(launchCalls[0]).to.include({ userDataDir: '/tmp/arpa-realtor-profile', headless: true });
    expect(evaluateCalls).to.have.length(1);
    expect(evaluateCalls[0]).to.deep.include({
      apiBaseUrl: 'https://api2.realtor.ca',
      method: 'GET',
      path: '/Location.svc/SubAreaSearch',
    });
    await transport.close();
  });

  it('reports browser challenges as an explicit RealtorChallengeError', async () => {
    const mod = await loadRealtorModule();
    if (!mod) return;

    const page = {
      async goto() {
        return { status: () => 403 };
      },
      async title() {
        return 'Just a moment...';
      },
      async content() {
        return '<html><body>Checking your browser before accessing realtor.ca</body></html>';
      },
      url() {
        return 'https://www.realtor.ca/';
      },
      async close() {},
    };
    const browser = {
      async newPage() {
        return page;
      },
      async close() {},
    };
    const puppeteer = {
      async launch() {
        return browser;
      },
    };
    const transport = new mod.RealtorBrowserTransport({ puppeteer, userDataDir: '/tmp/arpa-realtor-profile' });

    try {
      await transport.request({ method: 'GET', path: '/Location.svc/SubAreaSearch', query: { Area: 'Ottawa' } });
      expect.fail('Expected Realtor challenge error');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.RealtorChallengeError);
      expect(error.code).to.equal('REALTOR_CHALLENGE');
    } finally {
      await transport.close();
    }
  });
});
