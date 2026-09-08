import { expect } from 'chai';

const loadModule = async () => import('../../../lib/services/customSources/sourceTestService.js').catch(() => null);

const recipe = (overrides = {}) => ({
  version: 1,
  mode: 'static',
  url: 'https://rentals.example.com/ottawa',
  selectors: {
    listing: '.listing',
    title: '.title',
    price: '.price',
    url: 'a.details',
    image: '.image',
    beds: '.beds',
    baths: '.baths',
    address: '.address',
  },
  ...overrides,
});

const records = Array.from({ length: 12 }, (_, index) => ({
  title: `Listing ${index + 1}`,
  price: index === 11 ? null : `$${2000 + index}`,
  url: `https://rentals.example.com/listing/${index + 1}`,
  image: index % 2 === 0 ? `https://rentals.example.com/image/${index + 1}.jpg` : null,
  beds: index < 10 ? '2' : null,
  baths: '1',
  address: index < 9 ? `${index + 1} Bank St` : null,
  sourcePageUrl: 'https://rentals.example.com/ottawa',
}));

describe('Custom Source Test Extraction service', () => {
  it('exports the service factory and report helpers', async () => {
    const mod = await loadModule();
    expect(mod, 'Custom Source Test Extraction service module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.createCustomSourceTestService).to.be.a('function');
    expect(mod.computeCoverage).to.be.a('function');
    expect(mod.hashNormalizedRecipe).to.be.a('function');
  });

  it('runs the extractor for the validated recipe mode and returns bounded preview plus coverage', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const calls = { static: [], browser: [] };
    const service = mod.createCustomSourceTestService({
      staticExtractor: {
        async extract(value) {
          calls.static.push(value);
          return { records, pagesFetched: 2 };
        },
      },
      browserExtractor: {
        async extract(value) {
          calls.browser.push(value);
          return { records: [], pagesFetched: 0 };
        },
      },
      previewLimit: 10,
    });

    const report = await service.test(recipe());

    expect(calls.static).to.have.length(1);
    expect(calls.browser).to.have.length(0);
    expect(calls.static[0]).to.include({ version: 1, mode: 'static' });
    expect(calls.static[0].pagination).to.deep.equal({ type: 'none', maxPages: 1, nextSelector: null });
    expect(report.totalRecords).to.equal(12);
    expect(report.pagesFetched).to.equal(2);
    expect(report.preview).to.deep.equal(records.slice(0, 10));
    expect(report.coverage.title).to.deep.equal({ present: 12, total: 12 });
    expect(report.coverage.price).to.deep.equal({ present: 11, total: 12 });
    expect(report.coverage.beds).to.deep.equal({ present: 10, total: 12 });
    expect(report.coverage.address).to.deep.equal({ present: 9, total: 12 });
    expect(report.activationReady).to.equal(false);
    expect(report.requiredFields).to.deep.equal(['title', 'price', 'url']);
    expect(report.recipeHash).to.match(/^[a-f0-9]{64}$/);
  });

  it('marks a non-empty extraction activation-ready only when every required field has full coverage', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const complete = records.slice(0, 3).map((item) => ({ ...item, price: item.price ?? '$2200' }));
    const service = mod.createCustomSourceTestService({
      staticExtractor: { extract: async () => ({ records: complete, pagesFetched: 1 }) },
      browserExtractor: { extract: async () => ({ records: [], pagesFetched: 0 }) },
    });

    const report = await service.test(recipe());
    expect(report.activationReady).to.equal(true);

    const emptyService = mod.createCustomSourceTestService({
      staticExtractor: { extract: async () => ({ records: [], pagesFetched: 1 }) },
      browserExtractor: { extract: async () => ({ records: [], pagesFetched: 0 }) },
    });
    const empty = await emptyService.test(recipe());
    expect(empty.activationReady).to.equal(false);
  });

  it('uses browser extraction for browser recipes', async () => {
    const mod = await loadModule();
    if (!mod) return;

    let browserCalls = 0;
    const service = mod.createCustomSourceTestService({
      staticExtractor: { extract: async () => ({ records: [], pagesFetched: 0 }) },
      browserExtractor: {
        extract: async () => {
          browserCalls += 1;
          return { records: records.slice(0, 1), pagesFetched: 1 };
        },
      },
    });

    const report = await service.test(recipe({ mode: 'browser', browser: { timeoutMs: 5000 } }));
    expect(browserCalls).to.equal(1);
    expect(report.totalRecords).to.equal(1);
  });

  it('hashes normalized equivalent recipes identically', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const service = mod.createCustomSourceTestService({
      staticExtractor: { extract: async () => ({ records: records.slice(0, 1), pagesFetched: 1 }) },
      browserExtractor: { extract: async () => ({ records: [], pagesFetched: 0 }) },
    });

    const implicitDefaults = await service.test(recipe());
    const explicitDefaults = await service.test(
      recipe({
        pagination: { type: 'none', maxPages: 1 },
      }),
    );

    expect(implicitDefaults.recipeHash).to.equal(explicitDefaults.recipeHash);
  });

  it('rejects invalid recipes before invoking an extractor', async () => {
    const mod = await loadModule();
    if (!mod) return;

    let calls = 0;
    const extractor = { extract: async () => { calls += 1; return { records: [], pagesFetched: 0 }; } };
    const service = mod.createCustomSourceTestService({ staticExtractor: extractor, browserExtractor: extractor });

    try {
      await service.test(recipe({ url: 'http://127.0.0.1/private' }));
      expect.fail('Expected invalid recipe to fail');
    } catch (error) {
      expect(error.name).to.equal('CustomSourceRecipeError');
      expect(error.field).to.equal('url');
    }
    expect(calls).to.equal(0);
  });
});
