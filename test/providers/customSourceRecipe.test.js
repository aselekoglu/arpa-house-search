import { expect } from 'chai';

const loadRecipeModule = async () => import('../../lib/providers/custom-source/recipe.js').catch(() => null);

const validStaticRecipe = (overrides = {}) => ({
  version: 1,
  mode: 'static',
  url: 'https://rentals.example.com/ottawa',
  selectors: {
    listing: '.listing-card',
    title: '.listing-title',
    price: '.listing-price',
    url: 'a.listing-link',
    image: 'img.listing-photo',
    beds: '.beds',
    baths: '.baths',
    address: '.address',
  },
  ...overrides,
});

describe('Custom Source Recipe v1', () => {
  it('exports the recipe validator contract', async () => {
    const mod = await loadRecipeModule();
    expect(mod, 'Custom Source recipe module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.validateCustomSourceRecipe).to.be.a('function');
    expect(mod.CustomSourceRecipeError).to.be.a('function');
  });

  it('normalizes a minimal static recipe with deterministic defaults', async () => {
    const mod = await loadRecipeModule();
    if (!mod) return;

    const recipe = mod.validateCustomSourceRecipe({
      version: 1,
      mode: 'static',
      url: '  https://rentals.example.com/ottawa  ',
      selectors: {
        listing: ' .listing-card ',
        title: ' .title ',
        price: ' .price ',
        url: ' a.details ',
      },
    });

    expect(recipe).to.deep.equal({
      version: 1,
      mode: 'static',
      url: 'https://rentals.example.com/ottawa',
      selectors: {
        listing: '.listing-card',
        title: '.title',
        price: '.price',
        url: 'a.details',
        image: null,
        beds: null,
        baths: null,
        address: null,
      },
      pagination: {
        type: 'none',
        maxPages: 1,
        nextSelector: null,
      },
      browser: null,
    });
  });

  it('accepts bounded browser and next-button pagination options', async () => {
    const mod = await loadRecipeModule();
    if (!mod) return;

    const recipe = mod.validateCustomSourceRecipe({
      ...validStaticRecipe(),
      mode: 'browser',
      pagination: {
        type: 'next-button',
        nextSelector: 'button.next-page',
        maxPages: 5,
      },
      browser: {
        waitUntil: 'networkidle2',
        timeoutMs: 20_000,
        waitForSelector: '.listing-card',
      },
    });

    expect(recipe.pagination).to.deep.equal({
      type: 'next-button',
      maxPages: 5,
      nextSelector: 'button.next-page',
    });
    expect(recipe.browser).to.deep.equal({
      waitUntil: 'networkidle2',
      timeoutMs: 20_000,
      waitForSelector: '.listing-card',
    });
  });

  it('requires v1 mode, URL and core selectors with field-specific errors', async () => {
    const mod = await loadRecipeModule();
    if (!mod) return;

    const invalidRecipes = [
      { recipe: null, field: 'recipe' },
      { recipe: { ...validStaticRecipe(), version: 2 }, field: 'version' },
      { recipe: { ...validStaticRecipe(), mode: 'dynamic' }, field: 'mode' },
      { recipe: { ...validStaticRecipe(), url: '' }, field: 'url' },
      {
        recipe: { ...validStaticRecipe(), selectors: { ...validStaticRecipe().selectors, title: '' } },
        field: 'selectors.title',
      },
    ];

    for (const { recipe, field } of invalidRecipes) {
      expect(() => mod.validateCustomSourceRecipe(recipe)).to.throw(mod.CustomSourceRecipeError).with.property('field', field);
    }
  });

  it('rejects unsafe or non-public source URLs before activation', async () => {
    const mod = await loadRecipeModule();
    if (!mod) return;

    const unsafeUrls = [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://user:secret@rentals.example.com/listings',
      'http://localhost:3000/listings',
      'http://127.0.0.1/listings',
      'http://10.0.0.5/listings',
      'http://172.20.0.5/listings',
      'http://192.168.1.5/listings',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/listings',
      'http://[fc00::1]/listings',
      'http://[fe80::1]/listings',
    ];

    for (const url of unsafeUrls) {
      expect(() => mod.validateCustomSourceRecipe(validStaticRecipe({ url })))
        .to.throw(mod.CustomSourceRecipeError)
        .with.property('field', 'url');
    }
  });

  it('requires bounded and internally consistent pagination', async () => {
    const mod = await loadRecipeModule();
    if (!mod) return;

    const invalidPagination = [
      { value: { type: 'scroll' }, field: 'pagination.type' },
      { value: { type: 'next-button', maxPages: 5 }, field: 'pagination.nextSelector' },
      { value: { type: 'next-button', nextSelector: '.next', maxPages: 0 }, field: 'pagination.maxPages' },
      { value: { type: 'next-button', nextSelector: '.next', maxPages: 11 }, field: 'pagination.maxPages' },
      { value: { type: 'none', nextSelector: '.next' }, field: 'pagination.nextSelector' },
    ];

    for (const { value, field } of invalidPagination) {
      expect(() => mod.validateCustomSourceRecipe(validStaticRecipe({ pagination: value })))
        .to.throw(mod.CustomSourceRecipeError)
        .with.property('field', field);
    }
  });

  it('keeps browser-only behavior bounded and rejects it in static mode', async () => {
    const mod = await loadRecipeModule();
    if (!mod) return;

    expect(() =>
      mod.validateCustomSourceRecipe(
        validStaticRecipe({
          browser: { timeoutMs: 10_000 },
        }),
      ),
    )
      .to.throw(mod.CustomSourceRecipeError)
      .with.property('field', 'browser');

    const invalidBrowserOptions = [
      { browser: { waitUntil: 'forever' }, field: 'browser.waitUntil' },
      { browser: { timeoutMs: 999 }, field: 'browser.timeoutMs' },
      { browser: { timeoutMs: 30_001 }, field: 'browser.timeoutMs' },
      { browser: { waitForSelector: '' }, field: 'browser.waitForSelector' },
    ];

    for (const { browser, field } of invalidBrowserOptions) {
      expect(() => mod.validateCustomSourceRecipe(validStaticRecipe({ mode: 'browser', browser })))
        .to.throw(mod.CustomSourceRecipeError)
        .with.property('field', field);
    }
  });

  it('rejects unknown schema keys so typos do not silently activate', async () => {
    const mod = await loadRecipeModule();
    if (!mod) return;

    expect(() => mod.validateCustomSourceRecipe({ ...validStaticRecipe(), headers: { Authorization: 'secret' } }))
      .to.throw(mod.CustomSourceRecipeError)
      .with.property('field', 'headers');

    expect(() =>
      mod.validateCustomSourceRecipe(
        validStaticRecipe({
          selectors: {
            ...validStaticRecipe().selectors,
            headline: '.headline',
          },
        }),
      ),
    )
      .to.throw(mod.CustomSourceRecipeError)
      .with.property('field', 'selectors.headline');
  });
});
