import { expect } from 'chai';
import fs from 'node:fs';

describe('Search Profile API registration', () => {
  it('mounts Search Profiles behind auth before route execution', () => {
    const source = fs.readFileSync('lib/api/api.js', 'utf8');
    expect(source).to.include("import { searchProfileRouter } from './routes/searchProfileRouter.js';");

    const authMount = "service.use('/api/searchProfiles', authInterceptor());";
    const routerMount = "service.use('/api/searchProfiles', searchProfileRouter);";
    const authIndex = source.indexOf(authMount);
    const routerIndex = source.indexOf(routerMount);

    expect(authIndex, 'Search Profiles auth middleware should be mounted').to.be.greaterThan(-1);
    expect(routerIndex, 'Search Profiles router should be mounted').to.be.greaterThan(-1);
    expect(authIndex, 'Search Profiles auth middleware must execute before Search Profiles router').to.be.lessThan(routerIndex);
  });
});
