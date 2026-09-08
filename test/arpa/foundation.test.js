import { expect } from 'chai';
import fs from 'fs';

const read = (path) => fs.readFileSync(path, 'utf8');

describe('ARPA foundation', () => {
  it('uses ARPA package identity', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.name).to.equal('arpa-house-search');
    expect(pkg.license).to.equal('MIT');
  });

  it('uses ARPA browser identity', () => {
    const html = read('index.html');
    expect(html).to.include('<title>ARPA House Search</title>');
    expect(html).to.include('id="arpa"');
  });

  it('does not contain the inherited Fredy tracking destination', () => {
    const tracker = read('lib/services/tracking/Tracker.js');
    expect(tracker).not.to.include('fredy.orange-coding.net');
  });

  it('defaults inherited analytics setting to disabled', () => {
    const migration = read('lib/services/storage/migrations/sql/6.settings.js');
    expect(migration).to.include('analyticsEnabled: false');
  });

  it('records the MIT baseline boundary', () => {
    const baseline = read('BASELINE.md');
    expect(baseline).to.include('2a815c92e6da9cceb9633fb5b96086897a245c35');
    expect(baseline).to.include('license at this commit: MIT');
  });
});
