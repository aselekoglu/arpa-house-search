import { lookup } from 'node:dns/promises';
import puppeteer from 'puppeteer';
import { nanoid } from 'nanoid';
import { hash as hashPassword } from '../services/security/hash.js';
import { validateCustomSourceRecipe } from '../providers/custom-source/recipe.js';
import {
  createCustomSourceTestService,
  hashNormalizedRecipe,
} from '../services/customSources/sourceTestService.js';
import { StaticCustomSourceExtractor } from '../providers/custom-source/staticExtractor.js';
import { BrowserCustomSourceExtractor } from '../providers/custom-source/browserExtractor.js';
import { mapCustomSourceRecordToCanonicalListing } from '../providers/custom-source/canonicalMapper.js';
import { createRealtorCaAdapter } from '../providers/adapters/realtor-ca.js';
import { RealtorBrowserTransport, RealtorClient } from '../clients/realtor/index.js';
import { createSearchProfile } from '../domain/search/searchProfile.js';
import { isSearchProfileDue } from '../services/searchProfiles/searchProfileScheduler.js';

const activeProfiles = new Set();

const requiredText = (value, field, maxLength = 200) => {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new TypeError(`${field} is too long`);
  return normalized;
};

const messageOf = (error) =>
  error instanceof Error && error.message ? error.message : String(error);

const launchOptions = (options = {}) => ({
  ...options,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || options.executablePath,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    ...(Array.isArray(options.args) ? options.args : []),
  ],
});

const productionPuppeteer = Object.freeze({
  launch: (options) => puppeteer.launch(launchOptions(options)),
});

const activationView = (source) => {
  const normalizedRecipe = validateCustomSourceRecipe(source.recipe);
  const currentHash = hashNormalizedRecipe(normalizedRecipe);
  const report = source.lastTestReport ?? null;
  const canEnable =
    report?.activationReady === true &&
    typeof source.lastTestRecipeHash === 'string' &&
    source.lastTestRecipeHash === currentHash;
  return {
    ...source,
    recipe: normalizedRecipe,
    lastTestStatus: report == null ? null : report.activationReady ? 'pass' : 'fail',
    activation: {
      recipeValid: true,
      canEnable,
      needsRetest:
        typeof source.lastTestRecipeHash === 'string' &&
        source.lastTestRecipeHash.length > 0 &&
        source.lastTestRecipeHash !== currentHash,
    },
  };
};

const aggregateRunStatus = (results) => {
  const completed = results.filter((item) => item.status === 'completed').length;
  const failed = results.filter((item) => item.status === 'failed').length;
  if (failed === 0) return 'completed';
  if (completed === 0) return 'failed';
  return 'partial';
};

export const createProductionRuntime = ({ store, now = Date.now } = {}) => {
  if (store == null) throw new TypeError('store is required');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const staticExtractor = new StaticCustomSourceExtractor({ lookup });
  const browserExtractor = new BrowserCustomSourceExtractor({
    lookup,
    puppeteer: productionPuppeteer,
  });
  const sourceTestService = createCustomSourceTestService({
    staticExtractor,
    browserExtractor,
  });

  const ownedSource = async (userId, sourceId) => {
    const source = await store.getSource(sourceId);
    if (!source || source.userId !== userId) throw new Error('Custom Source not found');
    return source;
  };

  const ownedProfile = async (userId, profileId) => {
    const profile = await store.getProfile(profileId);
    if (!profile || profile.userId !== userId) throw new Error('Search Profile not found');
    return profile;
  };

  const normalizeProfileInput = async ({ userId, input }) => {
    const profileId = input?.profileId ?? nanoid();
    const existing = input?.profileId ? await store.getProfile(input.profileId) : null;
    if (existing && existing.userId !== userId) throw new Error('Search Profile not found');

    const sources = Array.isArray(input?.enabledSources) ? input.enabledSources : [];
    for (const source of sources) {
      if (source?.kind !== 'custom-source') continue;
      const custom = await store.getSource(source.id);
      if (!custom || custom.userId !== userId) throw new Error('Custom Source not found');
    }

    const timestamp = now();
    return createSearchProfile(
      {
        id: profileId,
        userId,
        name: input?.name,
        city: input?.city,
        region: input?.region,
        maxPrice: input?.maxPrice,
        minBedrooms: input?.minBedrooms,
        minBathrooms: input?.minBathrooms,
        enabledSources: sources,
        schedule: input?.schedule,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      },
      { now },
    );
  };

  const executeProvider = async ({ profile, source, seenAt }) => {
    if (source.id !== 'realtor-ca') throw new Error(`Provider is not available: ${source.id}`);
    const transport = new RealtorBrowserTransport({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      userDataDir: '/tmp/arpa-realtor',
      headless: true,
    });
    const client = new RealtorClient({ transport });
    const adapter = createRealtorCaAdapter({ client });
    try {
      const raw = await adapter.discover({ profile, sourceConfig: {} });
      return {
        label: 'Realtor.ca',
        listings: raw.map((item) => adapter.normalize(item, { now: seenAt })),
        discoveredCount: raw.length,
      };
    } finally {
      await client.close().catch(() => {});
    }
  };

  const executeCustomSource = async ({ profile, source, seenAt }) => {
    const custom = await store.getSource(source.id);
    if (!custom || custom.userId !== profile.userId || custom.enabled !== true) {
      throw new Error(`Custom Source is not available: ${source.id}`);
    }
    const extractor = custom.recipe?.mode === 'browser' ? browserExtractor : staticExtractor;
    const result = await extractor.extract(custom.recipe);
    const records = Array.isArray(result?.records) ? result.records : [];
    return {
      label: custom.name,
      discoveredCount: records.length,
      listings: records.map((record) =>
        mapCustomSourceRecordToCanonicalListing({
          sourceId: custom.id,
          record,
          now: seenAt,
        }),
      ),
    };
  };

  const executeSource = ({ profile, source, seenAt }) => {
    if (source.kind === 'provider') return executeProvider({ profile, source, seenAt });
    if (source.kind === 'custom-source') return executeCustomSource({ profile, source, seenAt });
    throw new Error(`Unsupported source kind: ${source.kind}`);
  };

  const executeProfile = async ({ userId, profileId, trigger = 'manual' }) => {
    const profile = await ownedProfile(userId, profileId);
    if (!['manual', 'scheduled'].includes(trigger)) throw new TypeError('Invalid run trigger');
    if (activeProfiles.has(profile.id)) throw new Error('Search Profile already has a run in progress');

    activeProfiles.add(profile.id);
    const runId = nanoid();
    const startedAt = now();
    try {
      await store.createRun({ id: runId, profileId: profile.id, trigger, startedAt });
      const outcomes = [];

      for (const source of profile.enabledSources ?? []) {
        const sourceStartedAt = now();
        let label = source.kind === 'provider' && source.id === 'realtor-ca' ? 'Realtor.ca' : source.id;
        try {
          const execution = await executeSource({ profile, source, seenAt: sourceStartedAt });
          label = execution.label;
          for (const listing of execution.listings) {
            const expected =
              source.kind === 'provider' ? source.id : `custom-source:${source.id}`;
            if (listing.providerId !== expected) throw new Error('Listing provider identity mismatch');
          }
          const ingestion = await store.upsertListings({
            profileId: profile.id,
            sourceKind: source.kind,
            sourceId: source.id,
            sourceLabel: label,
            listings: execution.listings,
            seenAt: sourceStartedAt,
          });
          const outcome = {
            runId,
            sourceKind: source.kind,
            sourceId: source.id,
            sourceLabel: label,
            status: 'completed',
            discoveredCount: execution.discoveredCount,
            ingestedCount: ingestion.ingested,
            errorMessage: null,
            startedAt: sourceStartedAt,
            finishedAt: now(),
          };
          await store.recordRunSource(outcome);
          outcomes.push(outcome);
        } catch (error) {
          if (source.kind === 'custom-source') {
            const custom = await store.getSource(source.id).catch(() => null);
            if (custom?.name) label = custom.name;
          }
          const outcome = {
            runId,
            sourceKind: source.kind,
            sourceId: source.id,
            sourceLabel: label,
            status: 'failed',
            discoveredCount: 0,
            ingestedCount: 0,
            errorMessage: messageOf(error).slice(0, 1000),
            startedAt: sourceStartedAt,
            finishedAt: now(),
          };
          await store.recordRunSource(outcome);
          outcomes.push(outcome);
        }
      }

      return store.finishRun({
        id: runId,
        status: aggregateRunStatus(outcomes),
        finishedAt: now(),
      });
    } finally {
      activeProfiles.delete(profile.id);
    }
  };

  return Object.freeze({
    async authenticate(username, password) {
      const normalized = requiredText(username, 'username', 160);
      if (typeof password !== 'string' || password.length === 0) return null;
      const user = await store.getUserByUsername(normalized);
      if (!user || user.password_hash !== hashPassword(password)) return null;
      await store.touchUserLogin(user.id, now());
      return { userId: user.id, isAdmin: Boolean(user.is_admin) };
    },

    async currentUser(userId) {
      if (!userId) return null;
      const user = await store.getUserById(userId);
      return user ? { userId: user.id, isAdmin: Boolean(user.is_admin) } : null;
    },

    async listSources(userId) {
      return (await store.listSources(userId)).map(activationView);
    },

    async saveSource(userId, input) {
      const id = input?.sourceId ?? nanoid();
      const name = requiredText(input?.name, 'name', 160);
      const recipe = validateCustomSourceRecipe(input?.recipe);
      const existing = input?.sourceId ? await store.getSource(input.sourceId) : null;
      if (existing && existing.userId !== userId) throw new Error('Custom Source not found');
      const changed =
        existing != null &&
        hashNormalizedRecipe(validateCustomSourceRecipe(existing.recipe)) !== hashNormalizedRecipe(recipe);
      const saved = await store.saveSource({
        id,
        userId,
        name,
        recipe,
        disable: changed,
        now: now(),
      });
      if (!saved) throw new Error('Custom Source not found');
      return activationView(saved);
    },

    async testSource(userId, sourceId) {
      const source = await ownedSource(userId, sourceId);
      const report = await sourceTestService.test(source.recipe);
      await store.updateSourceTest({
        id: source.id,
        userId,
        recipeHash: report.recipeHash,
        report,
        now: now(),
      });
      return report;
    },

    async setSourceEnabled(userId, sourceId, enabled) {
      const source = activationView(await ownedSource(userId, sourceId));
      if (enabled && !source.activation.canEnable) {
        throw new Error('Run a successful Test Extraction for this exact recipe before enabling');
      }
      const saved = await store.setSourceEnabled({
        id: sourceId,
        userId,
        enabled: Boolean(enabled),
        now: now(),
      });
      return activationView(saved);
    },

    async deleteSource(userId, sourceId) {
      if (!(await store.deleteSource({ id: sourceId, userId }))) throw new Error('Custom Source not found');
      return { deleted: true, id: sourceId };
    },

    listProfiles: (userId) => store.listProfiles(userId),

    async saveProfile(userId, input) {
      const profile = await normalizeProfileInput({ userId, input });
      const saved = await store.saveProfile(profile);
      if (!saved) throw new Error('Search Profile not found');
      return saved;
    },

    async deleteProfile(userId, profileId) {
      if (!(await store.deleteProfile({ id: profileId, userId }))) throw new Error('Search Profile not found');
      return { deleted: true, id: profileId };
    },

    async getExecutionContext(userId, profileId) {
      const profile = await ownedProfile(userId, profileId);
      return {
        profileId: profile.id,
        city: profile.city,
        region: profile.region,
        maxPrice: profile.maxPrice,
        minBedrooms: profile.minBedrooms,
        minBathrooms: profile.minBathrooms,
        sources: profile.enabledSources,
        schedule: profile.schedule,
      };
    },

    queryFeed: ({ userId, profileId, sort }) => store.queryFeed({ userId, profileId, sort }),
    executeProfile,

    async schedulerTick() {
      const profiles = await store.listScheduledProfiles();
      const current = now();
      const due = [];
      for (const profile of profiles) {
        const latestRun = await store.getLatestRun(profile.id);
        if (isSearchProfileDue({ profile, latestRun, now: current })) due.push(profile);
      }
      const runs = [];
      for (const profile of due) {
        try {
          const run = await executeProfile({
            userId: profile.userId,
            profileId: profile.id,
            trigger: 'scheduled',
          });
          runs.push({ profileId: profile.id, runId: run.id, status: run.status });
        } catch (error) {
          runs.push({ profileId: profile.id, runId: null, status: 'failed', error: messageOf(error) });
        }
      }
      return {
        checked: profiles.length,
        due: due.length,
        completed: runs.filter((item) => item.status !== 'failed').length,
        failed: runs.filter((item) => item.status === 'failed').length,
        runs,
      };
    },
  });
};
