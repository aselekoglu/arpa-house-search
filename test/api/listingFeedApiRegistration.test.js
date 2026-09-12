import { expect } from 'chai';
import fs from 'node:fs';

describe('Listing Feed API registration', () => {
  it('mounts Listing Feed behind auth before route execution', () => {
    const source = fs.readFileSync('lib/api/api.js', 'utf8');
    expect(source).to.include("import { listingFeedRouter } from './routes/listingFeedRouter.js';");

    const authMount = "service.use('/api/listing-feed', authInterceptor());";
    const routerMount = "service.use('/api/listing-feed', listingFeedRouter);";
    const authIndex = source.indexOf(authMount);
    const routerIndex = source.indexOf(routerMount);

    expect(authIndex, 'Listing Feed auth middleware should be mounted').to.be.greaterThan(-1);
    expect(routerIndex, 'Listing Feed router should be mounted').to.be.greaterThan(-1);
    expect(authIndex, 'Listing Feed auth middleware must execute before Listing Feed router').to.be.lessThan(routerIndex);
  });
});
