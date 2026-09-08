import puppeteer from 'puppeteer';
import { setTimeout as delay } from 'node:timers/promises';
import { load } from 'cheerio';
import { validateCustomSourceRecipe } from './recipe.js';
import { CustomSourceExtractionError, CustomSourceNetworkError } from './errors.js';
import { assertPublicResolvedTarget } from './networkSafety.js';

const PASSIVE_PROTOCOLS = new Set(['about:', 'blob:', 'data:']);

const compactText = (value) => {
  if (value == null) return null;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized.length === 0 ? null : normalized;
};

const selectOne = ($root, selector, field) => {
  try {
    if ($root.is(selector)) return $root.first();
    return $root.find(selector).first();
  } catch (cause) {
    throw new CustomSourceExtractionError(field, `Invalid selector configured for ${field}`, {
      step: 'extract',
      cause,
    });
  }
};

const selectMany = ($, selector) => {
  try {
    return $(selector);
  } catch (cause) {
    throw new CustomSourceExtractionError('selectors.listing', 'Invalid listing selector', {
      step: 'extract',
      cause,
    });
  }
};

const textField = ($root, selector, field) => {
  if (selector == null) return null;
  const selected = selectOne($root, selector, field);
  return selected.length === 0 ? null : compactText(selected.text());
};

const resolveOptionalHttpUrl = (value, baseUrl) => {
  if (value == null || String(value).trim().length === 0) return null;
  try {
    const parsed = new URL(String(value).trim(), baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
};

const linkField = ($root, selector, field, baseUrl) => {
  if (selector == null) return null;
  const selected = selectOne($root, selector, field);
  if (selected.length === 0) return null;
  return resolveOptionalHttpUrl(selected.attr('href'), baseUrl);
};

const imageField = ($root, selector, baseUrl) => {
  if (selector == null) return null;
  const selected = selectOne($root, selector, 'selectors.image');
  if (selected.length === 0) return null;
  return resolveOptionalHttpUrl(selected.attr('src') ?? selected.attr('data-src'), baseUrl);
};

const extractRecords = (html, pageUrl, selectors) => {
  const $ = load(html);
  const listings = selectMany($, selectors.listing);
  const records = [];

  listings.each((_index, element) => {
    const $listing = $(element);
    records.push({
      title: textField($listing, selectors.title, 'selectors.title'),
      price: textField($listing, selectors.price, 'selectors.price'),
      url: linkField($listing, selectors.url, 'selectors.url', pageUrl),
      image: imageField($listing, selectors.image, pageUrl),
      beds: textField($listing, selectors.beds, 'selectors.beds'),
      baths: textField($listing, selectors.baths, 'selectors.baths'),
      address: textField($listing, selectors.address, 'selectors.address'),
      sourcePageUrl: pageUrl,
    });
  });

  return records;
};

const integerInRange = (value, field, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
};

const protocolOf = (value) => {
  try {
    return new URL(value).protocol;
  } catch {
    return null;
  }
};

export class BrowserCustomSourceExtractor {
  constructor({
    puppeteer: puppeteerInstance = puppeteer,
    lookup,
    maxScrolls = 3,
    scrollDelayMs = 250,
    headless = true,
  } = {}) {
    if (puppeteerInstance == null || typeof puppeteerInstance.launch !== 'function') {
      throw new TypeError('puppeteer must be a Puppeteer-compatible launcher');
    }
    if (typeof lookup !== 'function') throw new TypeError('lookup must be a function');

    this.puppeteer = puppeteerInstance;
    this.lookup = lookup;
    this.maxScrolls = integerInRange(maxScrolls, 'maxScrolls', 0, 20);
    this.scrollDelayMs = integerInRange(scrollDelayMs, 'scrollDelayMs', 0, 5_000);
    this.headless = Boolean(headless);
  }

  async extract(inputRecipe) {
    const recipe = validateCustomSourceRecipe(inputRecipe);
    if (recipe.mode !== 'browser') {
      throw new CustomSourceExtractionError('mode', 'Browser extractor requires a browser Custom Source recipe', {
        step: 'validate',
      });
    }

    await assertPublicResolvedTarget(recipe.url, { lookup: this.lookup, step: 'resolve' });

    let browser = null;
    let page = null;
    let pendingNetworkError = null;

    try {
      browser = await this.puppeteer.launch({ headless: this.headless });
      page = await browser.newPage();

      if (typeof page.setBypassServiceWorker === 'function') await page.setBypassServiceWorker(true);
      if (typeof page.setRequestInterception === 'function') await page.setRequestInterception(true);

      if (typeof page.on === 'function') {
        page.on('request', async (request) => {
          const target = request.url();
          const protocol = protocolOf(target);

          if (PASSIVE_PROTOCOLS.has(protocol)) {
            await request.continue();
            return;
          }

          try {
            const parsed = new URL(target);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              throw new CustomSourceNetworkError('Browser Custom Source requested an unsupported network protocol', {
                step: 'resolve',
                url: target,
              });
            }

            // Deliberately re-resolve every network request. Caching a prior public
            // answer would enlarge the DNS-rebinding window for user-supplied pages.
            await assertPublicResolvedTarget(target, { lookup: this.lookup, step: 'resolve' });
            await request.continue();
          } catch (cause) {
            const error =
              cause instanceof CustomSourceNetworkError
                ? cause
                : new CustomSourceNetworkError('Browser Custom Source request target was rejected', {
                    step: 'resolve',
                    url: target,
                    cause,
                  });
            pendingNetworkError ??= error;
            await request.abort();
          }
        });
      }

      try {
        await page.goto(recipe.url, {
          waitUntil: recipe.browser.waitUntil,
          timeout: recipe.browser.timeoutMs,
        });
      } catch (cause) {
        if (pendingNetworkError) throw pendingNetworkError;
        throw new CustomSourceNetworkError('Browser Custom Source initial navigation failed', {
          step: 'navigate',
          url: recipe.url,
          cause,
        });
      }
      if (pendingNetworkError) throw pendingNetworkError;

      const records = [];
      let pagesFetched = 0;

      while (pagesFetched < recipe.pagination.maxPages) {
        if (recipe.browser.waitForSelector) {
          try {
            await page.waitForSelector(recipe.browser.waitForSelector, { timeout: recipe.browser.timeoutMs });
          } catch (cause) {
            if (pendingNetworkError) throw pendingNetworkError;
            throw new CustomSourceExtractionError('browser.waitForSelector', 'Browser waitForSelector timed out', {
              step: 'wait',
              cause,
            });
          }
        }

        await this.#scrollPage(page);
        if (pendingNetworkError) throw pendingNetworkError;

        const pageUrl = page.url();
        const html = await page.content();
        records.push(...extractRecords(html, pageUrl, recipe.selectors));
        pagesFetched += 1;

        if (pagesFetched >= recipe.pagination.maxPages || recipe.pagination.type !== 'next-button') break;

        let next;
        try {
          next = await page.$(recipe.pagination.nextSelector);
        } catch (cause) {
          throw new CustomSourceExtractionError('pagination.nextSelector', 'Invalid pagination next selector', {
            step: 'pagination',
            cause,
          });
        }
        if (!next) break;

        const previousUrl = page.url();
        const navigationPromise =
          typeof page.waitForNavigation === 'function'
            ? page.waitForNavigation({ waitUntil: recipe.browser.waitUntil, timeout: recipe.browser.timeoutMs }).catch(() => null)
            : Promise.resolve(null);

        try {
          await next.click();
          await Promise.race([
            navigationPromise,
            typeof page.waitForFunction === 'function'
              ? page
                  .waitForFunction((before) => window.location.href !== before, { timeout: recipe.browser.timeoutMs }, previousUrl)
                  .catch(() => null)
              : Promise.resolve(null),
          ]);
        } catch (cause) {
          if (pendingNetworkError) throw pendingNetworkError;
          throw new CustomSourceExtractionError('pagination.nextSelector', 'Browser pagination click failed', {
            step: 'pagination',
            cause,
          });
        }
        if (pendingNetworkError) throw pendingNetworkError;
      }

      return { records, pagesFetched };
    } finally {
      if (page != null) {
        try {
          await page.close();
        } catch {
          // Best-effort browser cleanup.
        }
      }
      if (browser != null) {
        try {
          await browser.close();
        } catch {
          // Best-effort browser cleanup.
        }
      }
    }
  }

  async #scrollPage(page) {
    let previousHeight = null;

    for (let index = 0; index < this.maxScrolls; index += 1) {
      let height;
      try {
        height = await page.evaluate(() => {
          const currentHeight = document.documentElement?.scrollHeight ?? document.body?.scrollHeight ?? 0;
          window.scrollTo(0, currentHeight);
          return currentHeight;
        });
      } catch (cause) {
        throw new CustomSourceExtractionError('browser', 'Browser lazy-load scroll failed', {
          step: 'scroll',
          cause,
        });
      }

      if (this.scrollDelayMs > 0) await delay(this.scrollDelayMs);
      if (previousHeight != null && height === previousHeight) break;
      previousHeight = height;
    }
  }
}

export { CustomSourceExtractionError, CustomSourceNetworkError } from './errors.js';
