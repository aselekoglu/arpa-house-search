import { ProviderContractError, validateProviderAdapter } from './providerContract.js';

const providerId = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const hostnameForUrl = (value) => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
};

const healthErrorMessage = (error) => {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
};

export class ProviderRegistry {
  constructor(adapters = []) {
    this.adapters = new Map();
    this.metadata = new Map();
    this.domainOwners = new Map();
    this.load(adapters);
  }

  register(adapter) {
    const metadata = validateProviderAdapter(adapter);

    if (this.adapters.has(metadata.id)) {
      throw new ProviderContractError('id', `Provider id is already registered: ${metadata.id}`);
    }

    for (const domain of metadata.domains) {
      if (this.domainOwners.has(domain)) {
        throw new ProviderContractError('domains', `Provider domain is already registered: ${domain}`);
      }
    }

    this.adapters.set(metadata.id, adapter);
    this.metadata.set(metadata.id, metadata);
    for (const domain of metadata.domains) this.domainOwners.set(domain, metadata.id);
    return adapter;
  }

  load(entries = []) {
    if (!Array.isArray(entries)) {
      throw new ProviderContractError('providers', 'Provider modules must be supplied as an array');
    }

    for (const entry of entries) {
      const candidate = entry?.default ?? entry?.provider ?? entry;
      this.register(candidate);
    }
    return this;
  }

  get(id) {
    const normalizedId = providerId(id);
    return normalizedId ? (this.adapters.get(normalizedId) ?? null) : null;
  }

  resolveUrl(url) {
    const hostname = hostnameForUrl(url);
    if (!hostname) return null;

    const matchingDomains = [...this.domainOwners.keys()]
      .filter((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
      .sort((a, b) => b.length - a.length);

    if (matchingDomains.length === 0) return null;
    return this.get(this.domainOwners.get(matchingDomains[0]));
  }

  list() {
    return [...this.metadata.values()];
  }

  async healthCheck(id, context = {}) {
    const normalizedId = providerId(id);
    const adapter = this.get(normalizedId);
    if (!adapter) return null;

    const metadata = this.metadata.get(normalizedId);
    if (!metadata.capabilities.healthCheck) {
      return {
        providerId: normalizedId,
        supported: false,
        healthy: null,
        details: null,
        error: null,
      };
    }

    try {
      const result = await adapter.healthCheck(context);
      const healthy =
        typeof result === 'boolean'
          ? result
          : result != null && typeof result === 'object' && typeof result.healthy === 'boolean'
            ? result.healthy
            : Boolean(result);

      return {
        providerId: normalizedId,
        supported: true,
        healthy,
        details: result != null && typeof result === 'object' ? structuredClone(result) : null,
        error: null,
      };
    } catch (error) {
      return {
        providerId: normalizedId,
        supported: true,
        healthy: false,
        details: null,
        error: healthErrorMessage(error),
      };
    }
  }

  async healthCheckAll(context = {}) {
    return Promise.all(this.list().map(({ id }) => this.healthCheck(id, context)));
  }
}
