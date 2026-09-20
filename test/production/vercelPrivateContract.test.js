import { expect } from 'chai';
import fs from 'node:fs';

const read = (path) => {
  try { return fs.readFileSync(path, 'utf8'); } catch { return null; }
};

describe('private Vercel production surface', () => {
  it('provides a stateless production server and container deployment config', () => {
    const server = read('server.js');
    const docker = read('Dockerfile.vercel');
    const vercel = read('vercel.json');

    expect(server, 'server.js should exist').to.be.a('string');
    expect(server).to.include('DATABASE_URL');
    expect(server).to.include('/api/login');
    expect(server).to.include('/api/sources');
    expect(server).to.include('/api/searchProfiles');
    expect(server).to.include('/api/listing-feed');
    expect(server).to.include('/api/cron/search-profiles');

    expect(docker, 'Dockerfile.vercel should exist').to.be.a('string');
    expect(docker).to.include('chromium');
    expect(docker).to.include('PUPPETEER_EXECUTABLE_PATH');
    expect(docker).to.include('CMD ["node", "server.js"]');

    const config = JSON.parse(vercel);
    expect(config.crons).to.deep.include({
      path: '/api/cron/search-profiles',
      schedule: '0 11 * * *',
    });
  });

  it('keeps secrets out of committed production config', () => {
    const server = read('server.js') ?? '';
    const vercel = read('vercel.json') ?? '';
    const joined = server + vercel;
    expect(joined).to.not.match(/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/);
    expect(joined).to.not.include('DATABASE_URL=');
  });

  it('uses the M1-first UI shell instead of bootstrapping legacy Jobs/Admin data', () => {
    const app = read('ui/src/App.jsx');
    const nav = read('ui/src/components/navigation/Navigation.jsx');
    const login = read('ui/src/views/login/Login.jsx');

    expect(app).to.include('actions.user');
    expect(app).to.include('.getCurrentUser()');
    expect(app).to.not.include('actions.jobs.getJobs()');
    expect(app).to.not.include('actions.provider.getProvider()');
    expect(app).to.not.include('actions.generalSettings.getGeneralSettings()');
    expect(app).to.include('<Navigate to="/listings" replace />');

    expect(nav).to.include('Search Profiles');
    expect(nav).to.include('Listings');
    expect(nav).to.include('Sources');
    expect(nav).to.not.include("itemKey: '/jobs'");

    expect(login).to.include("navigate('/listings')");
  });
});
