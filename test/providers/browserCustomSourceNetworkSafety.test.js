import { expect } from 'chai';
import { BrowserCustomSourceExtractor } from '../../lib/providers/custom-source/browserExtractor.js';

const recipe = {
  version: 1,
  mode: 'browser',
  url: 'https://rentals.example.com/ottawa',
  selectors: {
    listing: '.listing',
    title: '.title',
    price: '.price',
    url: 'a.details',
  },
  pagination: { type: 'none', maxPages: 1 },
  browser: { waitUntil: 'domcontentloaded', timeoutMs: 10_000 },
};

describe('Browser Custom Source network safety', () => {
  it('re-resolves repeated same-host browser requests instead of caching a prior public answer', async () => {
    let requestHandler = null;
    let lookupCalls = 0;

    const lookup = async () => {
      lookupCalls += 1;
      return [{ address: '93.184.216.34', family: 4 }];
    };

    const request = (url) => ({
      url: () => url,
      async continue() {},
      async abort() {
        throw new Error(`Unexpected abort for ${url}`);
      },
    });

    const page = {
      async setBypassServiceWorker() {},
      async setRequestInterception(enabled) {
        expect(enabled).to.equal(true);
      },
      on(event, handler) {
        if (event === 'request') requestHandler = handler;
      },
      async goto(url) {
        await requestHandler(request(url));
        await requestHandler(request('https://rentals.example.com/app.js'));
      },
      url() {
        return recipe.url;
      },
      async content() {
        return '<article class="listing"><h2 class="title">A</h2><span class="price">$1</span><a class="details" href="/a"></a></article>';
      },
      async close() {},
    };

    const browser = {
      async newPage() {
        return page;
      },
      async close() {},
    };

    const extractor = new BrowserCustomSourceExtractor({
      puppeteer: { async launch() { return browser; } },
      lookup,
      maxScrolls: 0,
      scrollDelayMs: 0,
    });

    const result = await extractor.extract(recipe);

    expect(result.records).to.have.length(1);
    // One recipe preflight + initial navigation + repeated same-host subresource.
    expect(lookupCalls).to.equal(3);
  });
});
