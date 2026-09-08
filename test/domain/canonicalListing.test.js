import { expect } from 'chai';

const loadCanonicalModule = async () => import('../../lib/domain/listing/canonicalListing.js').catch(() => null);

describe('Canonical Listing v1', () => {
  it('exports the canonical listing contract', async () => {
    const mod = await loadCanonicalModule();
    expect(mod, 'canonical listing module should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.createCanonicalListing).to.be.a('function');
    expect(mod.canonicalListingId).to.be.a('function');
    expect(mod.CanonicalListingError).to.be.a('function');
  });

  it('creates a provider-agnostic listing with stable identity', async () => {
    const mod = await loadCanonicalModule();
    if (!mod) return;

    const base = {
      providerId: 'realtor-ca',
      sourceListingId: 28123456,
      url: 'https://www.realtor.ca/real-estate/28123456/example',
      title: '  Two bedroom in Centretown  ',
      price: '2150',
      currency: 'cad',
      beds: '2',
      baths: 1.5,
      address: '123 Bank St, Ottawa, ON',
      latitude: 45.415,
      longitude: -75.695,
      imageUrl: 'https://cdn.example.test/28123456.jpg',
      description: 'Bright south-facing unit',
      raw: { MlsNumber: 'X123', nested: { source: true } },
    };

    const listing = mod.createCanonicalListing(base, { now: 1_000 });
    const repriced = mod.createCanonicalListing({ ...base, price: 2200 }, { now: 2_000 });

    expect(listing).to.deep.include({
      providerId: 'realtor-ca',
      sourceListingId: '28123456',
      url: base.url,
      title: 'Two bedroom in Centretown',
      price: 2150,
      currency: 'CAD',
      beds: 2,
      baths: 1.5,
      address: base.address,
      latitude: 45.415,
      longitude: -75.695,
      imageUrl: base.imageUrl,
      description: base.description,
      firstSeen: 1_000,
      lastSeen: 1_000,
    });
    expect(listing.id).to.equal(repriced.id);
    expect(listing.id).to.equal(mod.canonicalListingId('realtor-ca', '28123456'));
  });

  it('keeps composite identity unambiguous when ids contain delimiters', async () => {
    const mod = await loadCanonicalModule();
    if (!mod) return;

    expect(mod.canonicalListingId('a:b', 'c')).to.not.equal(mod.canonicalListingId('a', 'b:c'));
  });

  it('defaults optional scalar fields to null and timestamps to now', async () => {
    const mod = await loadCanonicalModule();
    if (!mod) return;

    const listing = mod.createCanonicalListing(
      {
        providerId: 'custom-source:example',
        sourceListingId: 'abc-1',
        url: 'https://rentals.example.test/listing/abc-1',
      },
      { now: 42_000 },
    );

    expect(listing).to.include({
      title: null,
      price: null,
      currency: null,
      beds: null,
      baths: null,
      address: null,
      latitude: null,
      longitude: null,
      imageUrl: null,
      description: null,
      firstSeen: 42_000,
      lastSeen: 42_000,
      raw: null,
    });
  });

  it('requires provider identity and an absolute http(s) listing URL', async () => {
    const mod = await loadCanonicalModule();
    if (!mod) return;

    const cases = [
      [{ sourceListingId: '1', url: 'https://example.test/1' }, 'providerId'],
      [{ providerId: 'example', url: 'https://example.test/1' }, 'sourceListingId'],
      [{ providerId: 'example', sourceListingId: '1', url: '/listing/1' }, 'url'],
      [{ providerId: 'example', sourceListingId: '1', url: 'file:///tmp/listing' }, 'url'],
    ];

    for (const [input, field] of cases) {
      expect(() => mod.createCanonicalListing(input)).to.throw(mod.CanonicalListingError).with.property('field', field);
    }
  });

  it('rejects invalid timestamp ordering and out-of-range coordinates', async () => {
    const mod = await loadCanonicalModule();
    if (!mod) return;

    const base = {
      providerId: 'example',
      sourceListingId: '1',
      url: 'https://example.test/listing/1',
    };

    expect(() => mod.createCanonicalListing({ ...base, firstSeen: 2_000, lastSeen: 1_000 }))
      .to.throw(mod.CanonicalListingError)
      .with.property('field', 'lastSeen');
    expect(() => mod.createCanonicalListing({ ...base, latitude: 91 }))
      .to.throw(mod.CanonicalListingError)
      .with.property('field', 'latitude');
    expect(() => mod.createCanonicalListing({ ...base, longitude: -181 }))
      .to.throw(mod.CanonicalListingError)
      .with.property('field', 'longitude');
  });

  it('defensively copies raw provider data', async () => {
    const mod = await loadCanonicalModule();
    if (!mod) return;

    const raw = { nested: { value: 1 } };
    const listing = mod.createCanonicalListing(
      {
        providerId: 'example',
        sourceListingId: '1',
        url: 'https://example.test/listing/1',
        raw,
      },
      { now: 10 },
    );

    raw.nested.value = 99;
    expect(listing.raw).to.deep.equal({ nested: { value: 1 } });
  });
});
