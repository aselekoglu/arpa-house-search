import fs from 'fs';
import path from 'path';
import { checkIfConfigIsAccessible, getProviders, refreshConfig } from './lib/utils.js';
import * as similarityCache from './lib/services/similarity-check/similarityCache.js';
import * as jobStorage from './lib/services/storage/jobStorage.js';
import FredyPipeline from './lib/FredyPipeline.js';
import { duringWorkingHoursOrNotSet } from './lib/utils.js';
import { runMigrations } from './lib/services/storage/migrations/migrate.js';
import { ensureDemoUserExists, ensureAdminUserExists } from './lib/services/storage/userStorage.js';
import { cleanupDemoAtMidnight } from './lib/services/crons/demoCleanup-cron.js';
import logger from './lib/services/logger.js';
import { bus } from './lib/services/events/event-bus.js';
import { initActiveCheckerCron } from './lib/services/crons/listing-alive-cron.js';
import { getSettings } from './lib/services/storage/settingsStorage.js';
import SqliteConnection from './lib/services/storage/SqliteConnection.js';

const isConfigAccessible = await checkIfConfigIsAccessible();
await SqliteConnection.init();
await refreshConfig();

if (!isConfigAccessible) {
  logger.error('Configuration exists, but is not accessible. Please check the file permission');
  process.exit(1);
}

await runMigrations();

const settings = await getSettings();
const rawDir = settings.sqlitepath || '/db';
const relDir = rawDir.startsWith('/') ? rawDir.slice(1) : rawDir;
const absDir = path.isAbsolute(relDir) ? relDir : path.join(process.cwd(), relDir);
if (!fs.existsSync(absDir)) {
  fs.mkdirSync(absDir, { recursive: true });
}

const providers = await getProviders();

similarityCache.initSimilarityCache();
similarityCache.startSimilarityCacheReloader();

const INTERVAL = settings.interval * 60 * 1000;

await import('./lib/api/api.js');

if (settings.demoMode) {
  logger.info('Running in demo mode');
  cleanupDemoAtMidnight();
}

logger.info(`Started ARPA House Search successfully. UI: http://localhost:${settings.port}`);

ensureAdminUserExists();
ensureDemoUserExists();
initActiveCheckerCron();

bus.on('jobs:runAll', () => {
  logger.debug('Running ARPA search jobs manually');
  execute();
});

const execute = () => {
  const isDuringWorkingHoursOrNotSet = duringWorkingHoursOrNotSet(settings, Date.now());
  if (!settings.demoMode) {
    if (isDuringWorkingHoursOrNotSet) {
      settings.lastRun = Date.now();
      jobStorage
        .getJobs()
        .filter((job) => job.enabled)
        .forEach((job) => {
          job.provider
            .filter((p) => providers.find((loaded) => loaded.metaInformation.id === p.id) != null)
            .forEach(async (prov) => {
              const matchedProvider = providers.find((loaded) => loaded.metaInformation.id === prov.id);
              matchedProvider.init(prov, job.blacklist);
              await new FredyPipeline(
                matchedProvider.config,
                job.notificationAdapter,
                prov.id,
                job.id,
                similarityCache,
              ).execute();
            });
        });
    } else {
      logger.debug('Working hours set. Skipping as outside of working hours.');
    }
  }
};

setInterval(execute, INTERVAL);
execute();
