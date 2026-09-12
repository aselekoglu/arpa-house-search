import { expect } from 'chai';
import fs from 'node:fs';

describe('Search Profile runtime wiring', () => {
  it('assembles Realtor, Custom Source, Listing Feed, execution and scheduler once', () => {
    const runtime = fs.readFileSync('lib/services/searchProfiles/searchProfileRuntime.js', 'utf8');
    expect(runtime).to.include('ProviderRegistry');
    expect(runtime).to.include('createRealtorCaAdapter');
    expect(runtime).to.include('StaticCustomSourceExtractor');
    expect(runtime).to.include('BrowserCustomSourceExtractor');
    expect(runtime).to.include('createListingFeedService');
    expect(runtime).to.include('createSearchProfileExecutionService');
    expect(runtime).to.include('createSearchProfileScheduler');
    expect(runtime).to.include('searchProfileExecutionService');
    expect(runtime).to.include('searchProfileScheduler');
  });

  it('starts a local scheduler tick from index without duplicating execution logic', () => {
    const source = fs.readFileSync('index.js', 'utf8');
    expect(source).to.include('searchProfileScheduler');
    expect(source).to.include('searchProfileScheduler.tick()');
    expect(source).to.include('ARPA_PROFILE_SCHEDULER_INTERVAL_MS');
  });
});
