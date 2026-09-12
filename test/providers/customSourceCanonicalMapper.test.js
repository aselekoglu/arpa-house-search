import { expect } from 'chai';

const loadModule = async () => import('../../lib/providers/custom-source/canonicalMapper.js').catch(() => null);

describe('Custom Source canonical mapper', () => {
  it('exports the mapper contract', async () => {
    const mod = await loadModule();
    expect(mod, 'Custom Source canonical mapper should exist').to.not.equal(null);
    if (!mod) return;
    expect(mod.mapCustomSourceRecordToCanonicalListing).to.be.a('function');
  });

  it('maps an extracted Ottawa rental record into Canonical Listing v1 with stable URL identity', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const record = {
      title: '  Centretown two bedroom ',
      price: '$2,450 / month',
      url: 'https://pm.example/rentals/123',
      image: 'https://pm.example/img/123.jpg',
      beds: '2 beds',
      baths: '1.5 baths',
      address: '123 Bank St, Ottawa, ON',
    };

    const listing = mod.mapCustomSourceRecordToCanonicalListing({
      sourceId: 'pm-example',
      record,
      now: 1_000,
    });
    const repriced = mod.mapCustomSourceRecordToCanonicalListing({
      sourceId: 'pm-example',
      record: { ...record, price: '$2,500' },
      now: 2_000,
    });

    expect(listing).to.deep.include({
      providerId: 'custom-source:pm-example',
      sourceListingId: record.url,
      url: record.url,
      title: 'Centretown two bedroom',
      price: 2450,
      currency: 'CAD',
      beds: 2,
      baths: 1.5,
      address: record.address,
      imageUrl: record.image,
      firstSeen: 1_000,
      lastSeen: 1_000,
    });
    expect(listing.id).to.equal(repriced.id);
    expect(listing.raw).to.deep.equal(record);
  });

  it('keeps missing optional extracted fields null while requiring source id and URL', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const listing = mod.mapCustomSourceRecordToCanonicalListing({
      sourceId: 'pm-example',
      record: { title: 'Studio', price: '1995', url: 'https://pm.example/r/1' },
      now: 42,
    });
    expect(listing).to.include({ imageUrl: null, beds: null, baths: null, address: null, price: 1995 });

    expect(() => mod.mapCustomSourceRecordToCanonicalListing({
      sourceId: '',
      record: { url: 'https://pm.example/r/1' },
    })).to.throw(/sourceId/);

    expect(() => mod.mapCustomSourceRecordToCanonicalListing({
      sourceId: 'pm-example',
      record: { title: 'No URL' },
    })).to.throw();
  });
});
