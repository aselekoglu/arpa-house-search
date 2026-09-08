import { expect } from 'chai';
import { readFile } from 'node:fs/promises';

const read = async (path) => {
  try {
    return await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
  } catch {
    return null;
  }
};

describe('Custom Source Builder UI integration', () => {
  it('provides a Sources workspace and API client', async () => {
    const page = await read('ui/src/views/sources/CustomSources.jsx');
    const api = await read('ui/src/services/customSources.js');

    expect(page, 'Custom Sources workspace should exist').to.be.a('string');
    expect(api, 'Custom Sources API client should exist').to.be.a('string');

    for (const action of ['Save Draft', 'Test Extraction', 'Enable Source', 'Delete Source']) {
      expect(page).to.include(action);
    }
    expect(page).to.include('coverageRowsFromReport');
    expect(page).to.include('report.preview');
    expect(page).to.include('activation.canEnable');
    expect(page).to.include('isSourceFormDirty');
    expect(page).to.include('unsavedChanges');

    for (const endpoint of ["'/api/sources'", '`/api/sources/${sourceId}/test`', '`/api/sources/${sourceId}/status`']) {
      expect(api).to.include(endpoint);
    }
    expect(api).to.include('xhrDelete');
  });

  it('wires Sources into authenticated application routing and navigation', async () => {
    const app = await read('ui/src/App.jsx');
    const navigation = await read('ui/src/components/navigation/Navigation.jsx');

    expect(app).to.include("import CustomSources from './views/sources/CustomSources.jsx'");
    expect(app).to.include('path="/sources"');
    expect(navigation).to.include("itemKey: '/sources'");
    expect(navigation).to.include("text: 'Sources'");
  });
});
