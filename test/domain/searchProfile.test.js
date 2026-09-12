import { expect } from 'chai';

let domain;
try {
  domain = await import('../../lib/domain/search/searchProfile.js');
} catch {
  domain = null;
}

const validInput = () => ({
  id: 'profile-1',
  userId: 'user-1',
  name: 'Ottawa 2BR',
  city: 'Ottawa',
  region: 'ON',
  maxPrice: 2400,
  minBedrooms: 2,
  minBathrooms: 1,
  enabledSources: [
    { kind: 'provider', id: 'realtor-ca' },
    { kind: 'custom-source', id: 'source_abc-123' },
  ],
  schedule: { enabled: true, intervalMinutes: 15 },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_500,
});

describe('Search Profile v1', () => {
  it('exports the Search Profile domain contract', () => {
    expect(domain, 'Search Profile module should exist').to.not.equal(null);
    expect(domain).to.have.property('createSearchProfile').that.is.a('function');
    expect(domain).to.have.property('validateSourceReference').that.is.a('function');
  });

  it('creates an immutable provider-agnostic Ottawa search profile', () => {
    const input = validInput();
    const profile = domain.createSearchProfile(input);

    expect(profile).to.deep.equal(input);
    expect(Object.isFrozen(profile)).to.equal(true);
    expect(Object.isFrozen(profile.enabledSources)).to.equal(true);
    expect(profile.enabledSources.every(Object.isFrozen)).to.equal(true);
    expect(Object.isFrozen(profile.schedule)).to.equal(true);
  });

  it('defaults location and schedule conservatively while preserving unknown search bounds as null', () => {
    const profile = domain.createSearchProfile({
      id: 'profile-defaults',
      userId: 'user-1',
      name: 'Defaults',
      enabledSources: [],
    }, { now: () => 1234 });

    expect(profile).to.deep.include({
      city: 'Ottawa',
      region: 'ON',
      maxPrice: null,
      minBedrooms: null,
      minBathrooms: null,
      createdAt: 1234,
      updatedAt: 1234,
    });
    expect(profile.schedule).to.deep.equal({ enabled: false, intervalMinutes: 15 });
  });

  it('normalizes strings and defensively copies caller-owned data', () => {
    const input = validInput();
    input.name = '  Ottawa 2BR  ';
    input.city = ' Ottawa ';
    input.region = ' ON ';
    const profile = domain.createSearchProfile(input);

    input.enabledSources[0].id = 'mutated';
    input.schedule.intervalMinutes = 999;

    expect(profile.name).to.equal('Ottawa 2BR');
    expect(profile.city).to.equal('Ottawa');
    expect(profile.region).to.equal('ON');
    expect(profile.enabledSources[0]).to.deep.equal({ kind: 'provider', id: 'realtor-ca' });
    expect(profile.schedule.intervalMinutes).to.equal(15);
  });

  it('validates source references and rejects duplicates within a profile', () => {
    expect(domain.validateSourceReference({ kind: 'provider', id: ' realtor-ca ' })).to.deep.equal({
      kind: 'provider',
      id: 'realtor-ca',
    });
    expect(() => domain.validateSourceReference({ kind: 'unknown', id: 'x' })).to.throw(/kind/i);
    expect(() => domain.validateSourceReference({ kind: 'provider', id: 'bad id' })).to.throw(/id/i);

    const input = validInput();
    input.enabledSources.push({ kind: 'provider', id: 'realtor-ca' });
    expect(() => domain.createSearchProfile(input)).to.throw(/duplicate/i);
  });

  it('rejects malformed identity, names, bounds, schedules and timestamp ordering', () => {
    for (const [field, value] of [
      ['id', ''],
      ['userId', ''],
      ['name', '   '],
      ['city', ''],
      ['region', ''],
    ]) {
      expect(() => domain.createSearchProfile({ ...validInput(), [field]: value }), field).to.throw();
    }

    for (const [field, value] of [
      ['maxPrice', -1],
      ['maxPrice', Number.NaN],
      ['minBedrooms', -0.5],
      ['minBathrooms', Number.POSITIVE_INFINITY],
    ]) {
      expect(() => domain.createSearchProfile({ ...validInput(), [field]: value }), field).to.throw();
    }

    expect(() =>
      domain.createSearchProfile({ ...validInput(), schedule: { enabled: true, intervalMinutes: 0 } }),
    ).to.throw(/intervalMinutes/);
    expect(() =>
      domain.createSearchProfile({ ...validInput(), schedule: { enabled: true, intervalMinutes: 1441 } }),
    ).to.throw(/intervalMinutes/);
    expect(() =>
      domain.createSearchProfile({ ...validInput(), schedule: { enabled: 'yes', intervalMinutes: 15 } }),
    ).to.throw(/enabled/);
    expect(() =>
      domain.createSearchProfile({ ...validInput(), createdAt: 200, updatedAt: 100 }),
    ).to.throw(/updatedAt/);
  });
});
