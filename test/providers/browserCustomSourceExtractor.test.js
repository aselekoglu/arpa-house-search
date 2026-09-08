import { expect } from 'chai';

const loadBrowserModule = async () => import('../../lib/providers/custom-source/browserExtractor.js').catch(() => null);
const loadStaticModule = async () => import('../../lib/providers/custom-source/staticExtractor.js').catch(() => null);

const baseSelectors = {
  listing: '.listing',
  title: '.title',
  price: '.price',
  url: 'a.details',
  image: 'img.photo',
  beds: '.beds',
  baths: '.baths',
  address: '.address',
};

const browserRecipe = (overrides = {}) => ({
  version: 1,
  mode: 'browser',
  url: 'https://rentals.example.com/ottawa',
  selectors: baseSelectors,
  browser: {
    waitUntil: 'domcontentloaded',
    timeoutMs: 10_000,
    waitForSelector: '.listing',
  },
  ...overrides,
});

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

const response = (body) => ({
  status: 200,
  ok: true,
  headers: { get: () => null },
  async text() {
    return body;
  },
});

const makeBrowserHarness = ({ htmlPages, urls = null, redirectTarget = null } = {}) => {
  const pageUrls = urls ?? htmlPages.map((_html, index) => `https://rentals.example.com/ottawa?page=${index + 1}`);
  const mainFrame = {};
  let index = 0;
  let requestHandler = null;
  let currentUrl = pageUrls[0];
  let privateRequestAborted = false;

  const calls = {
    launch: [],
    goto: [],
    waits: [],
    scrolls: 0,
    clicks: 0,
    interception: [],
    pageClosed: 0,
    browserClosed: 0,
  };

  const makeRequest = (target, { navigation = true } = {}) => {
    let aborted = false;
    return {
      url: () => target,
      isNavigationRequest: () => navigation,
      frame: () => mainFrame,
      async continue() {
        calls.interception.push({ target, action: 'continue' });
      },
      async abort() {
        aborted = true;
        if (target === redirectTarget) privateRequestAborted = true;
        calls.interception.push({ target, action: 'abort' });
      },
      wasAborted: () => aborted,
    };
  };

  const page = {
    async setBypassServiceWorker() {},
    async setRequestInterception(enabled) {
      expect(enabled).to.equal(true);
    },
    on(event, handler) {
      if (event === 'request') requestHandler = handler;
    },
    mainFrame() {
      return mainFrame;
    },
    async goto(url, options) {
      calls.goto.push({ url, options });
      if (requestHandler) {
        const initial = makeRequest(url);
        await requestHandler(initial);
        if (initial.wasAborted()) throw new Error('initial navigation blocked');
      }
      currentUrl = pageUrls[index];
      if (redirectTarget && requestHandler) {
        const redirected = makeRequest(redirectTarget);
        await requestHandler(redirected);
        if (redirected.wasAborted()) throw new Error('redirect navigation blocked');
        currentUrl = redirectTarget;
      }
      return { status: () => 200 };
    },
    url() {
      return currentUrl;
    },
    async waitForSelector(selector, options) {
      calls.waits.push({ selector, options });
      return {};
    },
    async evaluate() {
      calls.scrolls += 1;
      return 1000;
    },
    async content() {
      return htmlPages[index];
    },
    async $(selector) {
      if (selector !== '.next' || index >= htmlPages.length - 1) return null;
      return {
        async click() {
          calls.clicks += 1;
          index += 1;
          currentUrl = pageUrls[index];
        },
      };
    },
    async waitForNavigation() {
      return null;
    },
    async waitForFunction() {
      return {};
    },
    async close() {
      calls.pageClosed += 1;
    },
  };

  const browser = {
    async newPage() {
      return page;
    },
    async close() {
      calls.browserClosed += 1;
    },
  };

  const puppeteer = {
    async launch(options) {
      calls.launch.push(options);
      return browser;
    },
  };

  return {
    puppeteer,
    calls,
    get privateRequestAborted() {
      return privateRequestAborted;
    },
  };
};

describe('Browser Custom Source extractor', () => {
  it('exports the Puppeteer extractor and shared typed errors', async () => {
    const mod = await loadBrowserModule();
    expect(mod, 'Browser Custom Source extractor module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.BrowserCustomSourceExtractor).to.be.a('function');
    expect(mod.CustomSourceExtractionError).to.be.a('function');
    expect(mod.CustomSourceNetworkError).to.be.a('function');
  });

  it('produces the same intermediate record shape as static extraction', async () => {
    const mod = await loadBrowserModule();
    const staticMod = await loadStaticModule();
    if (!mod || !staticMod) return;

    const html = `
      <article class="listing">
        <h2 class="title">Centretown Two Bedroom</h2>
        <span class="price">$2,150</span>
        <a class="details" href="/listing/a"></a>
        <img class="photo" src="/a.jpg" />
        <span class="beds">2</span><span class="baths">1</span>
        <span class="address">123 Bank St</span>
      </article>`;
    const harness = makeBrowserHarness({
      htmlPages: [html],
      urls: ['https://rentals.example.com/ottawa'],
    });
    const browser = new mod.BrowserCustomSourceExtractor({
      puppeteer: harness.puppeteer,
      lookup: publicLookup,
      maxScrolls: 0,
    });
    const browserResult = await browser.extract(browserRecipe());

    const staticExtractor = new staticMod.StaticCustomSourceExtractor({
      lookup: publicLookup,
      fetchImpl: async () => response(html),
    });
    const staticResult = await staticExtractor.extract({
      ...browserRecipe(),
      mode: 'static',
      browser: undefined,
    });

    expect(browserResult).to.deep.equal(staticResult);
  });

  it('uses recipe wait settings and keeps lazy-load scrolling bounded', async () => {
    const mod = await loadBrowserModule();
    if (!mod) return;

    const harness = makeBrowserHarness({ htmlPages: ['<article class="listing"></article>'] });
    const extractor = new mod.BrowserCustomSourceExtractor({
      puppeteer: harness.puppeteer,
      lookup: publicLookup,
      maxScrolls: 3,
      scrollDelayMs: 0,
      headless: true,
    });

    await extractor.extract(
      browserRecipe({
        browser: {
          waitUntil: 'networkidle2',
          timeoutMs: 20_000,
          waitForSelector: '.listing',
        },
      }),
    );

    expect(harness.calls.launch).to.have.length(1);
    expect(harness.calls.launch[0].headless).to.equal(true);
    expect(harness.calls.goto[0].options).to.deep.include({ waitUntil: 'networkidle2', timeout: 20_000 });
    expect(harness.calls.waits).to.deep.equal([{ selector: '.listing', options: { timeout: 20_000 } }]);
    expect(harness.calls.scrolls).to.be.at.most(3);
    expect(harness.calls.pageClosed).to.equal(1);
    expect(harness.calls.browserClosed).to.equal(1);
  });

  it('clicks next-button pagination sequentially and honors maxPages', async () => {
    const mod = await loadBrowserModule();
    if (!mod) return;

    const pages = [
      '<article class="listing"><h2 class="title">A</h2><span class="price">$1</span><a class="details" href="/a"></a></article>',
      '<article class="listing"><h2 class="title">B</h2><span class="price">$2</span><a class="details" href="/b"></a></article>',
      '<article class="listing"><h2 class="title">C</h2><span class="price">$3</span><a class="details" href="/c"></a></article>',
    ];
    const harness = makeBrowserHarness({ htmlPages: pages });
    const extractor = new mod.BrowserCustomSourceExtractor({
      puppeteer: harness.puppeteer,
      lookup: publicLookup,
      maxScrolls: 0,
    });

    const result = await extractor.extract(
      browserRecipe({ pagination: { type: 'next-button', nextSelector: '.next', maxPages: 2 } }),
    );

    expect(result.records.map((item) => item.title)).to.deep.equal(['A', 'B']);
    expect(result.pagesFetched).to.equal(2);
    expect(harness.calls.clicks).to.equal(1);
  });

  it('stops cleanly when the browser next selector is absent', async () => {
    const mod = await loadBrowserModule();
    if (!mod) return;

    const harness = makeBrowserHarness({ htmlPages: ['<article class="listing"></article>'] });
    const extractor = new mod.BrowserCustomSourceExtractor({
      puppeteer: harness.puppeteer,
      lookup: publicLookup,
      maxScrolls: 0,
    });
    const result = await extractor.extract(
      browserRecipe({ pagination: { type: 'next-button', nextSelector: '.next', maxPages: 5 } }),
    );

    expect(result.pagesFetched).to.equal(1);
    expect(harness.calls.clicks).to.equal(0);
  });

  it('rejects private DNS before launch and private redirect navigation before it is followed', async () => {
    const mod = await loadBrowserModule();
    if (!mod) return;

    const privateRoot = makeBrowserHarness({ htmlPages: ['<html></html>'] });
    const rootExtractor = new mod.BrowserCustomSourceExtractor({
      puppeteer: privateRoot.puppeteer,
      lookup: async () => [{ address: '10.0.0.7', family: 4 }],
      maxScrolls: 0,
    });
    try {
      await rootExtractor.extract(browserRecipe());
      expect.fail('Expected private root DNS to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.CustomSourceNetworkError);
      expect(error.step).to.equal('resolve');
      expect(privateRoot.calls.launch).to.have.length(0);
    }

    const privateTarget = 'http://127.0.0.1/internal';
    const redirected = makeBrowserHarness({ htmlPages: ['<html></html>'], redirectTarget: privateTarget });
    const redirectExtractor = new mod.BrowserCustomSourceExtractor({
      puppeteer: redirected.puppeteer,
      lookup: publicLookup,
      maxScrolls: 0,
    });
    try {
      await redirectExtractor.extract(browserRecipe());
      expect.fail('Expected private redirect navigation to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.CustomSourceNetworkError);
      expect(error.step).to.equal('resolve');
      expect(redirected.privateRequestAborted).to.equal(true);
      expect(redirected.calls.browserClosed).to.equal(1);
    }
  });

  it('attributes DOM selector failures and closes the browser on extraction errors', async () => {
    const mod = await loadBrowserModule();
    if (!mod) return;

    const harness = makeBrowserHarness({
      htmlPages: ['<article class="listing"><span class="price">$1</span></article>'],
    });
    const extractor = new mod.BrowserCustomSourceExtractor({
      puppeteer: harness.puppeteer,
      lookup: publicLookup,
      maxScrolls: 0,
    });

    try {
      await extractor.extract(
        browserRecipe({ selectors: { ...baseSelectors, price: '[' } }),
      );
      expect.fail('Expected selector error');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.CustomSourceExtractionError);
      expect(error.field).to.equal('selectors.price');
      expect(harness.calls.pageClosed).to.equal(1);
      expect(harness.calls.browserClosed).to.equal(1);
    }
  });

  it('rejects static recipes instead of silently changing execution mode', async () => {
    const mod = await loadBrowserModule();
    if (!mod) return;

    const harness = makeBrowserHarness({ htmlPages: ['<html></html>'] });
    const extractor = new mod.BrowserCustomSourceExtractor({
      puppeteer: harness.puppeteer,
      lookup: publicLookup,
      maxScrolls: 0,
    });

    try {
      await extractor.extract({ ...browserRecipe(), mode: 'static', browser: undefined });
      expect.fail('Expected mode validation failure');
    } catch (error) {
      expect(error).to.be.instanceOf(mod.CustomSourceExtractionError);
      expect(error.field).to.equal('mode');
    }
  });
});
