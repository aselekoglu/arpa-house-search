import { expect } from 'chai';

const loadModule = async () => import('../../ui/src/views/listings/listingFeedModel.js').catch(() => null);

describe('Listing Feed UI model', () => {
  it('exports formatting and sort contracts', async () => {
    const mod = await loadModule();
    expect(mod, 'Listing Feed UI model should exist').to.not.equal(null);
    if (!mod) return;

    expect(mod.LISTING_FEED_SORT_OPTIONS).to.deep.equal([
      { value: 'newest', label: 'Newest' },
      { value: 'price-asc', label: 'Price: low to high' },
      { value: 'price-desc', label: 'Price: high to low' },
    ]);
    expect(mod.formatListingPrice).to.be.a('function');
    expect(mod.formatListingFreshness).to.be.a('function');
    expect(mod.listingFeedErrorMessage).to.be.a('function');
  });

  it('formats Canadian rent and unknown price without inventing values', async () => {
    const mod = await loadModule();
    if (!mod) return;

    expect(mod.formatListingPrice(2200, 'CAD')).to.equal('$2,200');
    expect(mod.formatListingPrice(2199.5, 'CAD')).to.equal('$2,199.50');
    expect(mod.formatListingPrice(null, 'CAD')).to.equal('Price unavailable');
    expect(mod.formatListingPrice(1800, null)).to.equal('1,800');
  });

  it('presents profile freshness from first-seen time', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    expect(mod.formatListingFreshness(1_000, 1_000 + hour)).to.equal('New');
    expect(mod.formatListingFreshness(1_000, 1_000 + 2 * day + hour)).to.equal('2d ago');
    expect(mod.formatListingFreshness(null, 10_000)).to.equal('Freshness unknown');
  });

  it('turns structured and string API failures into useful UI text', async () => {
    const mod = await loadModule();
    if (!mod) return;

    expect(mod.listingFeedErrorMessage({ json: { message: 'Profile unavailable' } })).to.equal('Profile unavailable');
    expect(mod.listingFeedErrorMessage('Network failed')).to.equal('Network failed');
    expect(mod.listingFeedErrorMessage({})).to.equal('Listing Feed request failed');
  });
});
