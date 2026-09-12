import { expect } from 'chai';

let domain;
let execution;
try {
  domain = await import('../../../lib/domain/search/searchProfile.js');
  execution = await import('../../../lib/services/searchProfiles/profileExecutionContext.js');
} catch {
  domain = null;
  execution = null;
}

describe('Search Profile provider execution context', () => {
  it('exports the execution-context mapper', () => {
    expect(domain, 'Search Profile module should exist').to.not.equal(null);
    expect(execution, 'Profile execution-context module should exist').to.not.equal(null);
    expect(execution).to.have.property('createProfileExecutionContext').that.is.a('function');
  });

  it('exposes the exact search fields consumed by provider discover()', () => {
    const profile = domain.createSearchProfile({
      id: 'profile-1',
      userId: 'user-1',
      name: 'Ottawa central',
      city: 'Ottawa',
      region: 'ON',
      maxPrice: 2350,
      minBedrooms: 2,
      minBathrooms: 1,
      enabledSources: [
        { kind: 'provider', id: 'realtor-ca' },
        { kind: 'custom-source', id: 'source-1' },
      ],
      schedule: { enabled: true, intervalMinutes: 30 },
    }, { now: () => 100 });

    const context = execution.createProfileExecutionContext(profile);

    expect(context.profile).to.deep.equal({
      id: 'profile-1',
      name: 'Ottawa central',
      city: 'Ottawa',
      region: 'ON',
      maxPrice: 2350,
      minBedrooms: 2,
      minBathrooms: 1,
    });
    expect(context.enabledSources).to.deep.equal([
      { kind: 'provider', id: 'realtor-ca' },
      { kind: 'custom-source', id: 'source-1' },
    ]);
    expect(context.schedule).to.deep.equal({ enabled: true, intervalMinutes: 30 });
    expect(context).to.not.have.property('userId');
    expect(Object.isFrozen(context)).to.equal(true);
    expect(Object.isFrozen(context.profile)).to.equal(true);
    expect(Object.isFrozen(context.enabledSources)).to.equal(true);
    expect(context.enabledSources.every(Object.isFrozen)).to.equal(true);
    expect(Object.isFrozen(context.schedule)).to.equal(true);
  });
});
