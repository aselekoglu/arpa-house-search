import { expect } from 'chai';
import fs from 'node:fs';

const read = (path) => {
  try { return fs.readFileSync(path, 'utf8'); } catch { return null; }
};

describe('Listings Map UI integration', () => {
  it('provides an ARPA-owned MapLibre component with marker selection', () => {
    const map = read('ui/src/views/listings/ListingMap.jsx');
    const styles = read('ui/src/views/listings/ListingMap.less');

    expect(map, 'ListingMap component should exist').to.be.a('string');
    expect(map).to.include('loadMapLibre');
    expect(map).to.include('geocodedListings');
    expect(map).to.include('new maplibregl.Map');
    expect(map).to.include('new maplibregl.Marker');
    expect(map).to.include('onSelectListing');
    expect(map).to.include('selectedListingId');

    expect(styles, 'ListingMap styles should exist').to.be.a('string');
    expect(styles).to.include('var(--arpa-accent)');
    expect(styles).to.include('var(--arpa-line)');
  });

  it('shares selection state between canonical cards and the map', () => {
    const view = read('ui/src/views/listings/Listings.jsx');

    expect(view).to.include('ListingMap');
    expect(view).to.include('selectedListingId');
    expect(view).to.include('setSelectedListingId');
    expect(view).to.include('data-listing-id');
    expect(view).to.include('scrollIntoView');
    expect(view).to.include('listingFeed__card--selected');
  });
});
