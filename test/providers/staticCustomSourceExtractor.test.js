import { expect } from 'chai';

const loadModule = async () => import('../../lib/providers/custom-source/staticExtractor.js').catch(() => null);

const recipe = (overrides = {}) => ({
  version: 1,
  mode: 'static',
  url: 'https://rentals.example.com/ottawa',
  selectors: {
    listing: '.listing',
    title: '.title',
    price: '.price',
    url: 'a.details',
    image: 'img.photo',
    beds: '.beds',
    baths: '.baths',
    address: '.address',
  },
  ...overrides,
});

const response = (body, { status = 200, location = null } = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: {
    get(name) {
      return name.toLowerCase() === 'location' ? location : null;
    },
  },
  async text() {
    return body;
  },
});

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

describe('Static Custom Source extractor', () => {
  it('exports the extractor and typed errors', async () => {
    const mod = await loadModule();
    expect(mod, 'Static Custom Source extractor module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.StaticCustomSourceExtractor).to.be.a('function');
    expect(mod.CustomSourceExtractionError).to.be.a('function');
    expect(mod.CustomSourceNetworkError).to.be.a('function');
  });

  it('extracts source-native records and resolves relative listing/image URLs', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const html = `
      <main>
        <article class="listing">
          <h2 class="title">  Centretown Two Bedroom  </h2>
          <span class="price">$2,150 / month</span>
          <a class="details" href="/listing/alpha">Details</a>
          <img class="photo" src="/images/alpha.jpg" />
          <span class="beds">2</span>
          <span class="baths">1.5</span>
          <span class="address">123 Bank St</span>
        </article>
        <article class="listing">
          <h2 class="title">Glebe One Bedroom</h2>
          <span class="price">$1,950</span>
          <a class="details" href="https://rentals.example.com/listing/beta">Details</a>
          <img class="photo" src="https://cdn.example.com/beta.jpg" />
          <span class="beds">1</span>
          <span class="baths">1</span>
          <span class="address">456 Bank St</span>
        </article>
      </main>`;
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return response(html);
    };

    const extractor = new mod.StaticCustomSourceExtractor({ fetchImpl, lookup: publicLookup });
    const result = await extractor.extract(recipe());

    expect(result).to.deep.equal({
      records: [
        {
          title: 'Centretown Two Bedroom',
          price: '$2,150 / month',
          url: 'https://rentals.example.com/listing/alpha',
          image: 'https://rentals.example.com/images/alpha.jpg',
          beds: '2',
          baths: '1.5',
          address: '123 Bank St',
          sourcePageUrl: 'https://rentals.example.com/ottawa',
        },
        {
          title: 'Glebe One Bedroom',
          price: '$1,950',
          url: 'https://rentals.example.com/listing/beta',
          image: 'https://cdn.example.com/beta.jpg',
          beds: '1',
          baths: '1',
          address: '456 Bank St',
          sourcePageUrl: 'https://rentals.example.com/ottawa',
        },
      ],
      pagesFetched: 1,
    });
    expect(calls).to.have.length(1);
    expect(calls[0].options.redirect).to.equal('manual');
  });

  it('returns null for missing listing fields so Test Extraction can measure coverage', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const html = '<article class="listing"><a class="details" href="/listing/partial"></a></article>';
    const extractor = new mod.StaticCustomSourceExtractor({
      lookup: publicLookup,
      fetchImpl: async () => response(html),
    });

    const result = await extractor.extract(recipe());
    expect(result.records).to.deep.equal([
      {
        title: null,
        price: null,
        url: 'https://rentals.example.com/listing/partial',
        image: null,
        beds: null,
        baths: null,
        address: null,
        sourcePageUrl: 'https://rentals.example.com/ottawa',
      },
    ]);
  });

  it('follows href-based next-button pagination sequentially and honors maxPages', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const pages = new Map([
      [
        'https://rentals.example.com/ottawa',
        '<article class="listing"><h2 class="title">A</h2><span class="price">$1</span><a class="details" href="/a"></a></article><a class="next" href="/ottawa?page=2">Next</a>',
      ],
      [
        'https://rentals.example.com/ottawa?page=2',
        '<article class="listing"><h2 class="title">B</h2><span class="price">$2</span><a class="details" href="/b"></a></article><a class="next" href="/ottawa?page=3">Next</a>',
      ],
      [
        'https://rentals.example.com/ottawa?page=3',
        '<article class="listing"><h2 class="title">C</h2><span class="price">$3</span><a class="details" href="/c"></a></article>',
      ],
    ]);
    let inFlight = 0;
    let maxInFlight = 0;
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return response(pages.get(url));
    };
    const extractor = new mod.StaticCustomSourceExtractor({ fetchImpl, lookup: publicLookup });

    const result = await extractor.extract(
      recipe({
        pagination: { type: 'next-button', nextSelector: 'a.next', maxPages: 2 },
      }),
    );

    expect(result.records.map((item) => item.title)).to.deep.equal(['A', 'B']);
    expect(result.pagesFetched).to.equal(2);
    expect(calls).to.deep.equal([
      'https://rentals.example.com/ottawa',
      'https://rentals.example.com/ottawa?page=2',
    ]);
    expect(maxInFlight).to.equal(1);
  });

  it('stops cleanly when the configured next selector is absent and errors when it has no href', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const noNext = new mod.StaticCustomSourceExtractor({
      lookup: publicLookup,
      fetchImpl: async () => response('<article class="listing"></article>'),
    });
    const stopped = await noNext.extract(
      recipe({ pagination: { type: 'next-button', nextSelector: 'a.next', maxPages: 5 } }),
    );
    expect(stopped.pagesFetched).to.equal(1);

    const noHref = new mod.StaticCustomSourceExtractor({
      lookup: publicLookup,
      fetchImpl: async () => response('<article class="listing"></article><button class="next">Next</button>'),
    });
    try {
      await noHref.extract(recipe({ pagination: { type: 'next-button', nextSelector: '.next', maxPages: 5 } }));
      expect.fail('Expected pagination href error');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.CustomSourceExtractionError);
      expect(error.field).to.equal('pagination.nextSelector');
      expect(error.step).to.equal('pagination');
    }
  });

  it('attributes invalid selector syntax to the configured field', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const extractor = new mod.StaticCustomSourceExtractor({
      lookup: publicLookup,
      fetchImpl: async () => response('<article class="listing"><span class="price">$1</span></article>'),
    });

    try {
      await extractor.extract(
        recipe({
          selectors: { ...recipe().selectors, price: '[' },
        }),
      );
      expect.fail('Expected selector error');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.CustomSourceExtractionError);
      expect(error.field).to.equal('selectors.price');
      expect(error.step).to.equal('extract');
    }
  });

  it('fails explicitly on HTTP errors', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const extractor = new mod.StaticCustomSourceExtractor({
      lookup: publicLookup,
      fetchImpl: async () => response('upstream unavailable', { status: 503 }),
    });

    try {
      await extractor.extract(recipe());
      expect.fail('Expected HTTP error');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.CustomSourceNetworkError);
      expect(error.step).to.equal('fetch');
      expect(error.status).to.equal(503);
    }
  });

  it('rejects private DNS resolutions before fetch and checks redirect targets before following them', async () => {
    const mod = await loadModule();
    if (!mod) return;

    let fetchCalls = 0;
    const privateDns = new mod.StaticCustomSourceExtractor({
      lookup: async () => [{ address: '10.0.0.8', family: 4 }],
      fetchImpl: async () => {
        fetchCalls += 1;
        return response('never');
      },
    });

    try {
      await privateDns.extract(recipe());
      expect.fail('Expected private DNS resolution to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.CustomSourceNetworkError);
      expect(error.step).to.equal('resolve');
      expect(fetchCalls).to.equal(0);
    }

    const calls = [];
    const redirect = new mod.StaticCustomSourceExtractor({
      lookup: publicLookup,
      fetchImpl: async (url) => {
        calls.push(url);
        return response('', { status: 302, location: 'http://127.0.0.1/internal' });
      },
    });

    try {
      await redirect.extract(recipe());
      expect.fail('Expected private redirect target to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.CustomSourceNetworkError);
      expect(error.step).to.equal('resolve');
      expect(calls).to.deep.equal(['https://rentals.example.com/ottawa']);
    }
  });
});
