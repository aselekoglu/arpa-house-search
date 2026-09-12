import { expect } from 'chai';
import fs from 'node:fs';

const read = (path) => {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

describe('Unified Listings Feed UI integration', () => {
  it('provides a canonical feed API client and ARPA card workspace', () => {
    const service = read('ui/src/services/listingFeed.js');
    const view = read('ui/src/views/listings/Listings.jsx');
    const styles = read('ui/src/views/listings/Listings.less');

    expect(service, 'Listing Feed frontend API client should exist').to.be.a('string');
    expect(service).to.include("'/api/listing-feed?");
    expect(service).to.include('profileId');
    expect(service).to.include('sort');

    expect(view, 'Unified Listings Feed workspace should exist').to.be.a('string');
    expect(view).to.include('listSearchProfiles');
    expect(view).to.include('getListingFeed');
    expect(view).to.include('ArpaPageHeader');
    expect(view).to.include('ArpaSelect');
    expect(view).to.include('LISTING_FEED_SORT_OPTIONS');
    expect(view).to.include('sourceLabel');
    expect(view).to.include('formatListingFreshness');
    expect(view).to.include('imageUrl');
    expect(view).to.not.include('ListingsTable');

    expect(styles, 'Unified Listings Feed styles should exist').to.be.a('string');
    expect(styles).to.include('var(--arpa-line)');
    expect(styles).to.include('var(--arpa-surface)');
  });

  it('keeps profile selection and newest/price sorting visible in the workspace', () => {
    const view = read('ui/src/views/listings/Listings.jsx');
    expect(view).to.include('Search Profile');
    expect(view).to.include('Sort listings');
    expect(view).to.include('No listings found for this Search Profile');
    expect(view).to.include('Open listing');
  });
});
