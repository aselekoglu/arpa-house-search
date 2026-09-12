import { expect } from 'chai';
import fs from 'node:fs';

describe('Search Profile Run Now UI', () => {
  it('exposes the Run Now client and persisted-profile control', () => {
    const service = fs.readFileSync('ui/src/services/searchProfiles.js', 'utf8');
    const view = fs.readFileSync('ui/src/views/searchProfiles/SearchProfiles.jsx', 'utf8');

    expect(service).to.include('runSearchProfile');
    expect(service).to.include('/run');

    expect(view).to.include('runSearchProfile');
    expect(view).to.include('Run Now');
    expect(view).to.include('Run completed');
    expect(view).to.include('selectedProfile');
  });
});
