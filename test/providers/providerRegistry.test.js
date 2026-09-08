import { expect } from 'chai';

const loadProviderCore = async () => import('../../lib/providers/core/index.js').catch(() => null);

const adapter = (overrides = {}) => ({
  id: 'realtor-ca',
  name: 'Realtor.ca',
  domains: ['realtor.ca'],
  async discover() {
    return [];
  },
  normalize(raw) {
    return raw;
  },
  ...overrides,
});

describe('Provider Registry', () => {
  it('exports the stateless provider core contract', async () => {
    const mod = await loadProviderCore();
    expect(mod, 'provider core module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.ProviderRegistry).to.be.a('function');
    expect(mod.validateProviderAdapter).to.be.a('function');
    expect(mod.ProviderContractError).to.be.a('function');
  });

  it('rejects malformed adapters before registration', async () => {
    const mod = await loadProviderCore();
    if (!mod) return;

    const invalidAdapters = [
      [{ ...adapter(), id: '' }, 'id'],
      [{ ...adapter(), name: '' }, 'name'],
      [{ ...adapter(), domains: 'realtor.ca' }, 'domains'],
      [{ ...adapter(), discover: null }, 'discover'],
      [{ ...adapter(), normalize: null }, 'normalize'],
    ];

    for (const [candidate, field] of invalidAdapters) {
      expect(() => mod.validateProviderAdapter(candidate)).to.throw(mod.ProviderContractError).with.property('field', field);
    }
  });

  it('allows providers without fixed domains for explicit source configuration', async () => {
    const mod = await loadProviderCore();
    if (!mod) return;

    const custom = adapter({
      id: 'custom-source',
      name: 'Custom Source',
      domains: undefined,
    });
    const registry = new mod.ProviderRegistry([custom]);

    expect(registry.get('custom-source')).to.equal(custom);
    expect(registry.list()[0].domains).to.deep.equal([]);
    expect(registry.resolveUrl('https://rentals.example.test/listing/1')).to.equal(null);
  });

  it('rejects duplicate provider ids and normalized domain ownership', async () => {
    const mod = await loadProviderCore();
    if (!mod) return;

    const registry = new mod.ProviderRegistry([adapter()]);

    expect(() => registry.register(adapter({ name: 'Duplicate id', domains: ['example.test'] })))
      .to.throw(mod.ProviderContractError)
      .with.property('field', 'id');

    expect(() =>
      registry.register(
        adapter({
          id: 'other-provider',
          name: 'Other Provider',
          domains: ['https://www.REALTOR.ca/search'],
        }),
      ),
    )
      .to.throw(mod.ProviderContractError)
      .with.property('field', 'domains');
  });

  it('gets providers by id and resolves exact domains and subdomains from URLs', async () => {
    const mod = await loadProviderCore();
    if (!mod) return;

    const realtor = adapter();
    const registry = new mod.ProviderRegistry([realtor]);

    expect(registry.get('realtor-ca')).to.equal(realtor);
    expect(registry.get('missing')).to.equal(null);
    expect(registry.resolveUrl('https://www.realtor.ca/real-estate/123')).to.equal(realtor);
    expect(registry.resolveUrl('https://m.realtor.ca/map')).to.equal(realtor);
    expect(registry.resolveUrl('https://example.test/listing')).to.equal(null);
    expect(registry.resolveUrl('not a url')).to.equal(null);
  });

  it('lists stable metadata and inferred capabilities without exposing implementation methods', async () => {
    const mod = await loadProviderCore();
    if (!mod) return;

    const withDetails = adapter({
      async fetchDetails() {
        return {};
      },
      async healthCheck() {
        return true;
      },
    });

    const registry = new mod.ProviderRegistry([withDetails]);
    expect(registry.list()).to.deep.equal([
      {
        id: 'realtor-ca',
        name: 'Realtor.ca',
        domains: ['realtor.ca'],
        capabilities: {
          discover: true,
          normalize: true,
          fetchDetails: true,
          healthCheck: true,
        },
      },
    ]);
    expect(registry.list()[0]).to.not.have.property('discover');
    expect(registry.list()[0]).to.not.have.property('normalize');
  });

  it('accepts adapter modules through load()', async () => {
    const mod = await loadProviderCore();
    if (!mod) return;

    const realtor = adapter();
    const custom = adapter({
      id: 'custom-source',
      name: 'Custom Source',
      domains: ['rentals.example.test'],
    });
    const registry = new mod.ProviderRegistry();

    registry.load([realtor, { default: custom }]);

    expect(registry.get('realtor-ca')).to.equal(realtor);
    expect(registry.get('custom-source')).to.equal(custom);
  });

  it('isolates provider health check failures and reports unsupported checks', async () => {
    const mod = await loadProviderCore();
    if (!mod) return;

    const healthy = adapter({
      id: 'healthy',
      name: 'Healthy',
      domains: ['healthy.example.test'],
      async healthCheck() {
        return { healthy: true, latencyMs: 12 };
      },
    });
    const unsupported = adapter({
      id: 'unsupported',
      name: 'Unsupported',
      domains: ['unsupported.example.test'],
    });
    const broken = adapter({
      id: 'broken',
      name: 'Broken',
      domains: ['broken.example.test'],
      async healthCheck() {
        throw new Error('upstream unavailable');
      },
    });

    const registry = new mod.ProviderRegistry([healthy, unsupported, broken]);

    expect(await registry.healthCheck('healthy')).to.deep.equal({
      providerId: 'healthy',
      supported: true,
      healthy: true,
      details: { healthy: true, latencyMs: 12 },
      error: null,
    });
    expect(await registry.healthCheck('unsupported')).to.deep.equal({
      providerId: 'unsupported',
      supported: false,
      healthy: null,
      details: null,
      error: null,
    });
    expect(await registry.healthCheck('broken')).to.deep.equal({
      providerId: 'broken',
      supported: true,
      healthy: false,
      details: null,
      error: 'upstream unavailable',
    });

    const all = await registry.healthCheckAll();
    expect(all).to.have.length(3);
    expect(all.map((result) => result.providerId)).to.deep.equal(['healthy', 'unsupported', 'broken']);
    expect(all.find((result) => result.providerId === 'healthy').healthy).to.equal(true);
    expect(all.find((result) => result.providerId === 'broken').healthy).to.equal(false);
  });

  it('rejects explicit capability flags that contradict adapter methods', async () => {
    const mod = await loadProviderCore();
    if (!mod) return;

    expect(() =>
      mod.validateProviderAdapter(
        adapter({
          capabilities: { fetchDetails: true },
        }),
      ),
    )
      .to.throw(mod.ProviderContractError)
      .with.property('field', 'capabilities.fetchDetails');
  });
});
