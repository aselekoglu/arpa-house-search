import http from 'node:http';
import https from 'node:https';
import { lookup as defaultLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { CustomSourceNetworkError } from './errors.js';

const normalizedHostname = (value) => value.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

const isNonPublicIpv4 = (address) => {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;

  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
};

const isNonPublicIpv6 = (address) => {
  const normalized = normalizedHostname(address);
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('::ffff:')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('ff')) return true;
  if (normalized.startsWith('2001:db8:') || normalized === '2001:db8::') return true;
  return false;
};

export const isPublicIpAddress = (address) => {
  const version = isIP(normalizedHostname(address));
  if (version === 4) return !isNonPublicIpv4(normalizedHostname(address));
  if (version === 6) return !isNonPublicIpv6(normalizedHostname(address));
  return false;
};

const parsePublicHttpUrl = (value, step) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new CustomSourceNetworkError('Custom Source target must be an absolute HTTP(S) URL', {
      step,
      url: String(value),
      cause,
    });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new CustomSourceNetworkError('Custom Source target must use HTTP or HTTPS', { step, url: parsed.href });
  }
  if (parsed.username || parsed.password) {
    throw new CustomSourceNetworkError('Custom Source target must not contain embedded credentials', {
      step,
      url: parsed.href,
    });
  }

  const hostname = normalizedHostname(parsed.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new CustomSourceNetworkError('Custom Source target must resolve to a public host', { step, url: parsed.href });
  }

  const literalVersion = isIP(hostname);
  if (literalVersion !== 0 && !isPublicIpAddress(hostname)) {
    throw new CustomSourceNetworkError('Custom Source target resolved to a non-public address', {
      step,
      url: parsed.href,
    });
  }

  return { parsed, hostname, literalVersion };
};

const normalizeLookupResults = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && typeof value.address === 'string') return [value];
  return [];
};

export const assertPublicResolvedTarget = async (url, { lookup = defaultLookup, step = 'resolve' } = {}) => {
  const { parsed, hostname, literalVersion } = parsePublicHttpUrl(url, step);
  if (literalVersion !== 0) return parsed.href;

  let addresses;
  try {
    addresses = normalizeLookupResults(await lookup(hostname, { all: true, verbatim: true }));
  } catch (cause) {
    throw new CustomSourceNetworkError(`Could not resolve Custom Source host ${hostname}`, {
      step,
      url: parsed.href,
      cause,
    });
  }

  if (addresses.length === 0) {
    throw new CustomSourceNetworkError(`Custom Source host ${hostname} resolved to no addresses`, {
      step,
      url: parsed.href,
    });
  }

  for (const entry of addresses) {
    if (!entry || typeof entry.address !== 'string' || !isPublicIpAddress(entry.address)) {
      throw new CustomSourceNetworkError(`Custom Source host ${hostname} resolved to a non-public address`, {
        step,
        url: parsed.href,
      });
    }
  }

  return parsed.href;
};

const createGuardedLookup = (lookup) => (hostname, options, callback) => {
  Promise.resolve()
    .then(async () => {
      const results = normalizeLookupResults(await lookup(hostname, { all: true, verbatim: true }));
      if (results.length === 0 || results.some((entry) => !entry || !isPublicIpAddress(entry.address))) {
        throw new Error(`Refusing non-public DNS resolution for ${hostname}`);
      }
      return results;
    })
    .then((results) => {
      if (options?.all) {
        callback(
          null,
          results.map((entry) => ({ address: entry.address, family: entry.family ?? isIP(entry.address) })),
        );
        return;
      }
      const first = results[0];
      callback(null, first.address, first.family ?? isIP(first.address));
    })
    .catch((error) => callback(error));
};

export const createPublicOnlyAgents = ({ lookup = defaultLookup } = {}) => {
  const guardedLookup = createGuardedLookup(lookup);
  return {
    http: new http.Agent({ lookup: guardedLookup }),
    https: new https.Agent({ lookup: guardedLookup }),
  };
};
