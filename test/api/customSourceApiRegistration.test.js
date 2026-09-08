import { expect } from 'chai';
import fs from 'node:fs';

describe('Custom Source API registration', () => {
  it('mounts the Sources router behind auth before route execution', () => {
    const source = fs.readFileSync('lib/api/api.js', 'utf8');
    expect(source).to.include("import { customSourceRouter } from './routes/customSourceRouter.js';");

    const authMount = "service.use('/api/sources', authInterceptor());";
    const routerMount = "service.use('/api/sources', customSourceRouter);";
    const authIndex = source.indexOf(authMount);
    const routerIndex = source.indexOf(routerMount);

    expect(authIndex, 'Sources auth middleware should be mounted').to.be.greaterThan(-1);
    expect(routerIndex, 'Sources router should be mounted').to.be.greaterThan(-1);
    expect(authIndex, 'Sources auth middleware must execute before Sources router').to.be.lessThan(routerIndex);
  });
});
