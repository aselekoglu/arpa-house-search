import { expect } from 'chai';
import { readFile } from 'node:fs/promises';

const read = async (path) => {
  try {
    return await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
  } catch {
    return null;
  }
};

describe('Search Profiles UI integration', () => {
  it('provides a Search Profiles workspace and API client', async () => {
    const page = await read('ui/src/views/searchProfiles/SearchProfiles.jsx');
    const api = await read('ui/src/services/searchProfiles.js');

    expect(page, 'Search Profiles workspace should exist').to.be.a('string');
    expect(api, 'Search Profiles API client should exist').to.be.a('string');

    for (const text of ['New Profile', 'Save Profile', 'Delete Profile', 'Realtor.ca', 'Automatic execution is not wired yet']) {
      expect(page).to.include(text);
    }
    expect(page).to.include('listCustomSources');
    expect(page).to.include('sourceOptionsFromCustomSources');
    expect(page).to.include('scheduleEnabled');

    expect(api).to.include("'/api/searchProfiles'");
    expect(api).to.include('xhrDelete');
    expect(api).to.include('execution-context');
  });

  it('wires Search Profiles into authenticated routing and navigation', async () => {
    const app = await read('ui/src/App.jsx');
    const navigation = await read('ui/src/components/navigation/Navigation.jsx');

    expect(app).to.include("import SearchProfiles from './views/searchProfiles/SearchProfiles.jsx'");
    expect(app).to.include('path="/searchProfiles"');
    expect(navigation).to.include("itemKey: '/searchProfiles'");
    expect(navigation).to.include("text: 'Search Profiles'");
  });
});
