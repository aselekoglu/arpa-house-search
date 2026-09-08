import { isIP } from 'node:net';

export class CustomSourceRecipeError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'CustomSourceRecipeError';
    this.field = field;
  }
}

const ROOT_KEYS = new Set(['version', 'mode', 'url', 'selectors', 'pagination', 'browser']);
const SELECTOR_KEYS = new Set(['listing', 'title', 'price', 'url', 'image', 'beds', 'baths', 'address']);
const PAGINATION_KEYS = new Set(['type', 'maxPages', 'nextSelector']);
const BROWSER_KEYS = new Set(['waitUntil', 'timeoutMs', 'waitForSelector']);
const WAIT_UNTIL_VALUES = new Set(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']);

const isObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);

const requireObject = (value, field) => {
  if (!isObject(value)) {
    throw new CustomSourceRecipeError(field, `${field} must be an object`);
  }
  return value;
};

const rejectUnknownKeys = (value, allowedKeys, prefix = '') => {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      const field = prefix ? `${prefix}.${key}` : key;
      throw new CustomSourceRecipeError(field, `Unknown Custom Source recipe field: ${field}`);
    }
  }
};

const requiredText = (value, field) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CustomSourceRecipeError(field, `${field} must be a non-empty string`);
  }

  const normalized = value.trim();
  if (normalized.length > 500) {
    throw new CustomSourceRecipeError(field, `${field} must be at most 500 characters`);
  }
  return normalized;
};

const optionalText = (value, field) => {
  if (value == null) return null;
  return requiredText(value, field);
};

const integerInRange = (value, field, min, max, fallback) => {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CustomSourceRecipeError(field, `${field} must be an integer between ${min} and ${max}`);
  }
  return value;
};

const isPrivateIpv4 = (hostname) => {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
};

const isPrivateIpv6 = (hostname) => {
  const normalized = hostname.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;

  const ipv4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return ipv4Mapped ? isPrivateIpv4(ipv4Mapped[1]) : false;
};

const validatePublicUrl = (value) => {
  const url = requiredText(value, 'url');
  if (url.length > 4096) {
    throw new CustomSourceRecipeError('url', 'url must be at most 4096 characters');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new CustomSourceRecipeError('url', 'url must be an absolute HTTP(S) URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new CustomSourceRecipeError('url', 'url must use HTTP or HTTPS');
  }
  if (parsed.username || parsed.password) {
    throw new CustomSourceRecipeError('url', 'url must not contain embedded credentials');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new CustomSourceRecipeError('url', 'url must target a public host');
  }

  const ipVersion = isIP(hostname);
  if ((ipVersion === 4 && isPrivateIpv4(hostname)) || (ipVersion === 6 && isPrivateIpv6(hostname))) {
    throw new CustomSourceRecipeError('url', 'url must not target a private, loopback or link-local address');
  }

  return url;
};

const normalizeSelectors = (value) => {
  const selectors = requireObject(value, 'selectors');
  rejectUnknownKeys(selectors, SELECTOR_KEYS, 'selectors');

  return {
    listing: requiredText(selectors.listing, 'selectors.listing'),
    title: requiredText(selectors.title, 'selectors.title'),
    price: requiredText(selectors.price, 'selectors.price'),
    url: requiredText(selectors.url, 'selectors.url'),
    image: optionalText(selectors.image, 'selectors.image'),
    beds: optionalText(selectors.beds, 'selectors.beds'),
    baths: optionalText(selectors.baths, 'selectors.baths'),
    address: optionalText(selectors.address, 'selectors.address'),
  };
};

const normalizePagination = (value) => {
  if (value == null) {
    return { type: 'none', maxPages: 1, nextSelector: null };
  }

  const pagination = requireObject(value, 'pagination');
  rejectUnknownKeys(pagination, PAGINATION_KEYS, 'pagination');

  const type = pagination.type ?? 'none';
  if (type !== 'none' && type !== 'next-button') {
    throw new CustomSourceRecipeError('pagination.type', 'pagination.type must be none or next-button');
  }

  if (type === 'none') {
    if (pagination.nextSelector != null) {
      throw new CustomSourceRecipeError('pagination.nextSelector', 'pagination.nextSelector is only valid for next-button');
    }
    if (pagination.maxPages != null && pagination.maxPages !== 1) {
      throw new CustomSourceRecipeError('pagination.maxPages', 'pagination.maxPages must be 1 when pagination is disabled');
    }
    return { type: 'none', maxPages: 1, nextSelector: null };
  }

  return {
    type: 'next-button',
    maxPages: integerInRange(pagination.maxPages, 'pagination.maxPages', 1, 10, 5),
    nextSelector: requiredText(pagination.nextSelector, 'pagination.nextSelector'),
  };
};

const normalizeBrowser = (mode, value) => {
  if (mode === 'static') {
    if (value != null) {
      throw new CustomSourceRecipeError('browser', 'browser options are only valid in browser mode');
    }
    return null;
  }

  const browser = value == null ? {} : requireObject(value, 'browser');
  rejectUnknownKeys(browser, BROWSER_KEYS, 'browser');

  const waitUntil = browser.waitUntil ?? 'domcontentloaded';
  if (!WAIT_UNTIL_VALUES.has(waitUntil)) {
    throw new CustomSourceRecipeError(
      'browser.waitUntil',
      'browser.waitUntil must be load, domcontentloaded, networkidle0 or networkidle2',
    );
  }

  return {
    waitUntil,
    timeoutMs: integerInRange(browser.timeoutMs, 'browser.timeoutMs', 1_000, 30_000, 15_000),
    waitForSelector: optionalText(browser.waitForSelector, 'browser.waitForSelector'),
  };
};

export const validateCustomSourceRecipe = (input) => {
  const recipe = requireObject(input, 'recipe');
  rejectUnknownKeys(recipe, ROOT_KEYS);

  if (recipe.version !== 1) {
    throw new CustomSourceRecipeError('version', 'version must be exactly 1');
  }
  if (recipe.mode !== 'static' && recipe.mode !== 'browser') {
    throw new CustomSourceRecipeError('mode', 'mode must be static or browser');
  }

  return {
    version: 1,
    mode: recipe.mode,
    url: validatePublicUrl(recipe.url),
    selectors: normalizeSelectors(recipe.selectors),
    pagination: normalizePagination(recipe.pagination),
    browser: normalizeBrowser(recipe.mode, recipe.browser),
  };
};
