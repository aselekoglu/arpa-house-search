export class ProviderContractError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ProviderContractError';
    this.field = field;
  }
}

const CAPABILITY_METHODS = Object.freeze({
  discover: 'discover',
  normalize: 'normalize',
  fetchDetails: 'fetchDetails',
  healthCheck: 'healthCheck',
});

const requiredText = (value, field) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ProviderContractError(field, `${field} must be a non-empty string`);
  }
  return value.trim();
};

export const normalizeProviderDomain = (value) => {
  const domain = requiredText(value, 'domains');
  let parsed;

  try {
    parsed = new URL(domain.includes('://') ? domain : `https://${domain}`);
  } catch {
    throw new ProviderContractError('domains', `Invalid provider domain: ${domain}`);
  }

  let hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname.startsWith('www.')) hostname = hostname.slice(4);
  if (!hostname) {
    throw new ProviderContractError('domains', `Invalid provider domain: ${domain}`);
  }
  return hostname;
};

export const validateProviderAdapter = (adapter) => {
  if (adapter == null || typeof adapter !== 'object' || Array.isArray(adapter)) {
    throw new ProviderContractError('adapter', 'Provider adapter must be an object');
  }

  const id = requiredText(adapter.id, 'id');
  if (id !== id.toLowerCase() || !/^[a-z0-9][a-z0-9:_-]*$/.test(id)) {
    throw new ProviderContractError('id', 'Provider id must use lowercase letters, numbers, colon, underscore or hyphen');
  }

  const name = requiredText(adapter.name, 'name');
  const rawDomains = adapter.domains ?? [];

  if (!Array.isArray(rawDomains)) {
    throw new ProviderContractError('domains', 'Provider domains must be an array when supplied');
  }
  const domains = [...new Set(rawDomains.map(normalizeProviderDomain))];

  if (typeof adapter.discover !== 'function') {
    throw new ProviderContractError('discover', 'Provider must implement discover(context)');
  }
  if (typeof adapter.normalize !== 'function') {
    throw new ProviderContractError('normalize', 'Provider must implement normalize(rawListing, context)');
  }

  const capabilities = Object.fromEntries(
    Object.entries(CAPABILITY_METHODS).map(([capability, method]) => [capability, typeof adapter[method] === 'function']),
  );

  if (adapter.capabilities != null) {
    if (typeof adapter.capabilities !== 'object' || Array.isArray(adapter.capabilities)) {
      throw new ProviderContractError('capabilities', 'Provider capabilities must be an object');
    }

    for (const [capability, explicitValue] of Object.entries(adapter.capabilities)) {
      if (!(capability in CAPABILITY_METHODS)) {
        throw new ProviderContractError(`capabilities.${capability}`, `Unknown provider capability: ${capability}`);
      }
      if (typeof explicitValue !== 'boolean' || explicitValue !== capabilities[capability]) {
        throw new ProviderContractError(
          `capabilities.${capability}`,
          `${capability} capability must match the adapter method contract`,
        );
      }
    }
  }

  return Object.freeze({
    id,
    name,
    domains: Object.freeze(domains),
    capabilities: Object.freeze(capabilities),
  });
};
