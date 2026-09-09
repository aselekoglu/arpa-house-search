import { expect } from 'chai';

let model;
try {
  model = await import('../../ui/src/views/searchProfiles/searchProfileModel.js');
} catch {
  model = null;
}

describe('Search Profile UI model', () => {
  it('exports the Search Profile form contract', () => {
    expect(model, 'Search Profile UI model should exist').to.not.equal(null);
    if (!model) return;
    expect(model.createEmptySearchProfileForm).to.be.a('function');
    expect(model.searchProfilePayloadFromForm).to.be.a('function');
    expect(model.searchProfileFormFromProfile).to.be.a('function');
    expect(model.sourceOptionsFromCustomSources).to.be.a('function');
    expect(model.searchProfileErrorMessage).to.be.a('function');
  });

  it('creates an Ottawa-first empty form without silently enabling sources', () => {
    if (!model) return;
    expect(model.createEmptySearchProfileForm()).to.deep.equal({
      profileId: null,
      name: '',
      city: 'Ottawa',
      region: 'ON',
      maxPrice: '',
      minBedrooms: '',
      minBathrooms: '',
      selectedSourceKeys: [],
      scheduleEnabled: false,
      intervalMinutes: '15',
    });
  });

  it('converts form values into the exact API payload with blank bounds preserved as null', () => {
    if (!model) return;
    const payload = model.searchProfilePayloadFromForm({
      ...model.createEmptySearchProfileForm(),
      profileId: 'profile-1',
      name: ' Ottawa two bed ',
      maxPrice: ' 2500 ',
      minBedrooms: '2',
      minBathrooms: '',
      selectedSourceKeys: ['provider:realtor-ca', 'custom-source:source-1'],
      scheduleEnabled: true,
      intervalMinutes: '30',
    });

    expect(payload).to.deep.equal({
      profileId: 'profile-1',
      name: 'Ottawa two bed',
      city: 'Ottawa',
      region: 'ON',
      maxPrice: 2500,
      minBedrooms: 2,
      minBathrooms: null,
      enabledSources: [
        { kind: 'provider', id: 'realtor-ca' },
        { kind: 'custom-source', id: 'source-1' },
      ],
      schedule: { enabled: true, intervalMinutes: 30 },
    });
  });

  it('round-trips a stored profile into editable string form state', () => {
    if (!model) return;
    expect(model.searchProfileFormFromProfile({
      id: 'profile-2',
      name: 'Centretown',
      city: 'Ottawa',
      region: 'ON',
      maxPrice: 2300,
      minBedrooms: null,
      minBathrooms: 1,
      enabledSources: [{ kind: 'provider', id: 'realtor-ca' }],
      schedule: { enabled: true, intervalMinutes: 60 },
    })).to.deep.equal({
      profileId: 'profile-2',
      name: 'Centretown',
      city: 'Ottawa',
      region: 'ON',
      maxPrice: '2300',
      minBedrooms: '',
      minBathrooms: '1',
      selectedSourceKeys: ['provider:realtor-ca'],
      scheduleEnabled: true,
      intervalMinutes: '60',
    });
  });

  it('offers Realtor.ca plus only enabled Custom Sources, using stable source keys', () => {
    if (!model) return;
    expect(model.sourceOptionsFromCustomSources([
      { id: 'source-1', name: 'Centretown PM', enabled: true },
      { id: 'source-2', name: 'Disabled PM', enabled: false },
    ])).to.deep.equal([
      { key: 'provider:realtor-ca', kind: 'provider', id: 'realtor-ca', label: 'Realtor.ca' },
      { key: 'custom-source:source-1', kind: 'custom-source', id: 'source-1', label: 'Centretown PM' },
    ]);
  });

  it('rejects malformed numeric input instead of silently converting it to null', () => {
    if (!model) return;
    const base = model.createEmptySearchProfileForm();
    expect(() => model.searchProfilePayloadFromForm({ ...base, name: 'Bad price', maxPrice: 'abc' })).to.throw(/maxPrice/);
    expect(() => model.searchProfilePayloadFromForm({ ...base, name: 'Bad interval', intervalMinutes: '0' })).to.throw(/intervalMinutes/);
  });

  it('turns structured and string API failures into useful UI text', () => {
    if (!model) return;
    expect(model.searchProfileErrorMessage({ json: { message: 'Profile invalid' } })).to.equal('Profile invalid');
    expect(model.searchProfileErrorMessage('Network unavailable')).to.equal('Network unavailable');
  });
});
