import { expect } from 'chai';
import fs from 'node:fs';

describe('Listing Map runtime contract', () => {
  it('pins MapLibre and OpenFreeMap instead of copying Fredy map code', () => {
    const runtime = fs.readFileSync('ui/src/views/listings/maplibreRuntime.js', 'utf8');

    expect(runtime).to.include('maplibre-gl@6.9.0');
    expect(runtime).to.include('maplibre-gl.css');
    expect(runtime).to.include('https://tiles.openfreemap.org/styles/liberty');
    expect(runtime).to.include('loadMapLibre');
    expect(runtime).to.include('window.maplibregl');
  });
});
