import { expect } from 'chai';

const loadModule = async () => import('../../ui/src/views/listings/listingMapModel.js').catch(() => null);

describe('Listing Map model', () => {
  it('exports Ottawa defaults and canonical coordinate projection', async () => {
    const mod = await loadModule();
    expect(mod, 'Listing Map model should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.OTTAWA_MAP_CENTER).to.deep.equal([-75.6972, 45.4215]);
    expect(mod.OTTAWA_MAP_ZOOM).to.equal(10.5);
    expect(mod.geocodedListings).to.be.a('function');
  });

  it('keeps only finite in-range canonical coordinates without mutating rows', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const valid = { listingId: 'a', latitude: 45.42, longitude: -75.69, title: 'Valid' };
    const rows = [
      valid,
      { listingId: 'missing', latitude: null, longitude: null },
      { listingId: 'nan', latitude: Number.NaN, longitude: -75.7 },
      { listingId: 'lat-range', latitude: 91, longitude: -75.7 },
      { listingId: 'lng-range', latitude: 45.4, longitude: -181 },
      { listingId: 'zero', latitude: 0, longitude: 0 },
    ];

    const points = mod.geocodedListings(rows);
    expect(points).to.have.length(2);
    expect(points[0]).to.deep.equal(valid);
    expect(points[1].listingId).to.equal('zero');
    expect(points[0]).to.not.equal(valid);
  });

  it('finds a selected geocoded listing by canonical id', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const rows = [
      { id: 'hash-a', listingId: 'hash-a', latitude: 45.42, longitude: -75.69 },
      { id: 'hash-b', listingId: 'hash-b', latitude: null, longitude: null },
    ];
    expect(mod.selectedGeocodedListing(rows, 'hash-a')?.id).to.equal('hash-a');
    expect(mod.selectedGeocodedListing(rows, 'hash-b')).to.equal(null);
    expect(mod.selectedGeocodedListing(rows, null)).to.equal(null);
  });
});
