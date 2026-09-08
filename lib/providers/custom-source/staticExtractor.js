import fetch from 'node-fetch';
import { lookup as defaultLookup } from 'node:dns/promises';
import { load } from 'cheerio';
import { validateCustomSourceRecipe } from './recipe.js';
import { CustomSourceExtractionError, CustomSourceNetworkError } from './errors.js';
import { assertPublicResolvedTarget, createPublicOnlyAgents } from './networkSafety.js';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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

const nextPageUrl = ($, recipe, baseUrl) => {
  if (recipe.pagination.type !== 'next-button') return null;

  let selected;
  try {
    selected = $(recipe.pagination.nextSelector).first();
  } catch (cause) {
    throw new CustomSourceExtractionError('pagination.nextSelector', 'Invalid pagination next selector', {
      step: 'pagination',
      cause,
    });
  }

  if (selected.length === 0) return null;
  const href = compactText(selected.attr('href'));
  if (href == null) {
    throw new CustomSourceExtractionError(
      'pagination.nextSelector',
      'Static next-button pagination requires the selected element to expose an href',
      { step: 'pagination' },
    );
  }

  const resolved = resolveOptionalHttpUrl(href, baseUrl);
  if (resolved == null) {
    throw new CustomSourceExtractionError('pagination.nextSelector', 'Pagination href must resolve to HTTP(S)', {
      step: 'pagination',
    });
  }
  return resolved;
};

export class StaticCustomSourceExtractor {
  constructor({ fetchImpl = fetch, lookup = defaultLookup, maxRedirects = 5, requestTimeoutMs = 30_000 } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    if (typeof lookup !== 'function') throw new TypeError('lookup must be a function');
    if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) {
      throw new TypeError('maxRedirects must be an integer between 0 and 10');
    }
    if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1_000 || requestTimeoutMs > 60_000) {
      throw new TypeError('requestTimeoutMs must be an integer between 1000 and 60000');
    }

    this.fetchImpl = fetchImpl;
    this.lookup = lookup;
    this.maxRedirects = maxRedirects;
    this.requestTimeoutMs = requestTimeoutMs;
    this.agents = createPublicOnlyAgents({ lookup });
  }

  async extract(inputRecipe) {
    const recipe = validateCustomSourceRecipe(inputRecipe);
    if (recipe.mode !== 'static') {
      throw new CustomSourceExtractionError('mode', 'Static extractor requires a static Custom Source recipe', {
        step: 'validate',
      });
    }

    const records = [];
    let pageUrl = recipe.url;
    let pagesFetched = 0;

    while (pageUrl && pagesFetched < recipe.pagination.maxPages) {
      const page = await this.#fetchPage(pageUrl);
      pagesFetched += 1;
      const $ = load(page.html);
      const listings = selectMany($, recipe.selectors.listing);

      listings.each((_index, element) => {
        const $listing = $(element);
        records.push({
          title: textField($listing, recipe.selectors.title, 'selectors.title'),
          price: textField($listing, recipe.selectors.price, 'selectors.price'),
          url: linkField($listing, recipe.selectors.url, 'selectors.url', page.url),
          image: imageField($listing, recipe.selectors.image, page.url),
          beds: textField($listing, recipe.selectors.beds, 'selectors.beds'),
          baths: textField($listing, recipe.selectors.baths, 'selectors.baths'),
          address: textField($listing, recipe.selectors.address, 'selectors.address'),
          sourcePageUrl: page.url,
        });
      });

      pageUrl = pagesFetched >= recipe.pagination.maxPages ? null : nextPageUrl($, recipe, page.url);
    }

    return { records, pagesFetched };
  }

  close() {
    this.agents.http.destroy();
    this.agents.https.destroy();
  }

  async #fetchPage(startUrl) {
    let currentUrl = startUrl;

    for (let redirects = 0; redirects <= this.maxRedirects; redirects += 1) {
      currentUrl = await assertPublicResolvedTarget(currentUrl, { lookup: this.lookup, step: 'resolve' });

      let result;
      try {
        result = await this.fetchImpl(currentUrl, {
          redirect: 'manual',
          signal: AbortSignal.timeout(this.requestTimeoutMs),
          agent: (parsedUrl) => (parsedUrl.protocol === 'https:' ? this.agents.https : this.agents.http),
        });
      } catch (cause) {
        if (cause instanceof CustomSourceNetworkError) throw cause;
        throw new CustomSourceNetworkError(`Failed to fetch Custom Source page ${currentUrl}`, {
          step: 'fetch',
          url: currentUrl,
          cause,
        });
      }

      if (REDIRECT_STATUSES.has(result.status)) {
        if (redirects >= this.maxRedirects) {
          throw new CustomSourceNetworkError('Custom Source exceeded the redirect limit', {
            step: 'redirect',
            status: result.status,
            url: currentUrl,
          });
        }
        const location = result.headers?.get?.('location');
        if (!location) {
          throw new CustomSourceNetworkError('Custom Source redirect response did not include a Location header', {
            step: 'redirect',
            status: result.status,
            url: currentUrl,
          });
        }
        try {
          currentUrl = new URL(location, currentUrl).href;
        } catch (cause) {
          throw new CustomSourceNetworkError('Custom Source redirect Location was invalid', {
            step: 'redirect',
            status: result.status,
            url: currentUrl,
            cause,
          });
        }
        continue;
      }

      if (!result.ok) {
        throw new CustomSourceNetworkError(`Custom Source returned HTTP ${result.status}`, {
          step: 'fetch',
          status: result.status,
          url: currentUrl,
        });
      }

      let html;
      try {
        html = await result.text();
      } catch (cause) {
        throw new CustomSourceNetworkError('Could not read Custom Source response body', {
          step: 'fetch',
          status: result.status,
          url: currentUrl,
          cause,
        });
      }
      return { html, url: currentUrl };
    }

    throw new CustomSourceNetworkError('Custom Source exceeded the redirect limit', {
      step: 'redirect',
      url: currentUrl,
    });
  }
}

export { CustomSourceExtractionError, CustomSourceNetworkError } from './errors.js';
