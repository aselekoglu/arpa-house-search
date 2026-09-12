import { nanoid } from 'nanoid';
import { mapCustomSourceRecordToCanonicalListing } from '../../providers/custom-source/canonicalMapper.js';

const TRIGGERS = new Set(['manual', 'scheduled']);

export class SearchProfileExecutionAccessError extends Error {
  constructor(message = 'Search Profile is not available to the current user') {
    super(message);
    this.name = 'SearchProfileExecutionAccessError';
  }
}

export class SearchProfileRunInProgressError extends Error {
  constructor(message = 'Search Profile already has a run in progress') {
    super(message);
    this.name = 'SearchProfileRunInProgressError';
  }
}

const requiredText = (value, field) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} is required`);
  }
  return value.trim();
};

const errorMessage = (error) => {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
};

const aggregateStatus = (results) => {
  const completed = results.filter((result) => result.status === 'completed').length;
  const failed = results.filter((result) => result.status === 'failed').length;
  if (failed === 0) return 'completed';
  if (completed === 0) return 'failed';
  return 'partial';
};

const validateDependency = (value, method, name) => {
  if (value == null || typeof value[method] !== 'function') {
    throw new TypeError(`${name} must expose ${method}()`);
  }
  return value;
};

export const createSearchProfileExecutionService = ({
  searchProfileStorage,
  customSourceStorage,
  providerRegistry,
  staticExtractor,
  browserExtractor,
  listingFeedService,
  runStorage,
  idFactory = nanoid,
  now = Date.now,
} = {}) => {
  validateDependency(searchProfileStorage, 'getById', 'searchProfileStorage');
  validateDependency(customSourceStorage, 'getById', 'customSourceStorage');
  validateDependency(providerRegistry, 'get', 'providerRegistry');
  validateDependency(staticExtractor, 'extract', 'staticExtractor');
  validateDependency(browserExtractor, 'extract', 'browserExtractor');
  validateDependency(listingFeedService, 'ingest', 'listingFeedService');
  validateDependency(runStorage, 'createRun', 'runStorage');
  validateDependency(runStorage, 'recordSourceResult', 'runStorage');
  validateDependency(runStorage, 'finishRun', 'runStorage');
  validateDependency(runStorage, 'getRun', 'runStorage');
  if (typeof idFactory !== 'function') throw new TypeError('idFactory must be a function');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const activeProfiles = new Set();

  const executeProvider = async ({ profile, source, seenAt }) => {
    const adapter = providerRegistry.get(source.id);
    if (!adapter || typeof adapter.discover !== 'function' || typeof adapter.normalize !== 'function') {
      throw new Error(`Provider is not available: ${source.id}`);
    }

    const rawListings = await adapter.discover({ profile, sourceConfig: source.config ?? {} });
    const raw = Array.isArray(rawListings) ? rawListings : [];
    const listings = raw.map((item) => adapter.normalize(item, { now: seenAt }));

    return {
      label:
        typeof adapter.name === 'string' && adapter.name.trim().length > 0
          ? adapter.name.trim()
          : source.id,
      discoveredCount: raw.length,
      listings,
    };
  };

  const executeCustomSource = async ({ profile, source, seenAt }) => {
    const customSource = customSourceStorage.getById(source.id);
    if (!customSource || customSource.userId !== profile.userId || customSource.enabled !== true) {
      throw new Error(`Custom Source is not available: ${source.id}`);
    }

    const mode = customSource.recipe?.mode;
    const extractor = mode === 'static' ? staticExtractor : mode === 'browser' ? browserExtractor : null;
    if (!extractor) throw new Error(`Unsupported Custom Source mode: ${mode ?? 'unknown'}`);

    const extraction = await extractor.extract(customSource.recipe);
    const records = Array.isArray(extraction?.records) ? extraction.records : [];
    const listings = records.map((record) =>
      mapCustomSourceRecordToCanonicalListing({
        sourceId: customSource.id,
        record,
        now: seenAt,
      }),
    );

    return {
      label:
        typeof customSource.name === 'string' && customSource.name.trim().length > 0
          ? customSource.name.trim()
          : source.id,
      discoveredCount: records.length,
      listings,
    };
  };

  const executeSource = async ({ profile, source, seenAt }) => {
    if (source.kind === 'provider') return executeProvider({ profile, source, seenAt });
    if (source.kind === 'custom-source') return executeCustomSource({ profile, source, seenAt });
    throw new Error(`Unsupported source kind: ${source.kind}`);
  };

  const executeInternal = async ({ userId, profile, trigger, runId, startedAt }) => {
    const results = [];

    try {
      runStorage.createRun({
        id: runId,
        profileId: profile.id,
        trigger,
        startedAt,
      });

      for (const source of profile.enabledSources ?? []) {
        const sourceStartedAt = now();
        let sourceLabel =
          source.kind === 'provider' && source.id === 'realtor-ca'
            ? 'Realtor.ca'
            : source.id;

        try {
          const execution = await executeSource({
            profile,
            source,
            seenAt: sourceStartedAt,
          });
          sourceLabel = execution.label;
          const ingestion = listingFeedService.ingest({
            userId,
            profileId: profile.id,
            source: { kind: source.kind, id: source.id },
            listings: execution.listings,
            seenAt: sourceStartedAt,
          });

          const result = {
            runId,
            sourceKind: source.kind,
            sourceId: source.id,
            sourceLabel,
            status: 'completed',
            discoveredCount: execution.discoveredCount,
            ingestedCount: ingestion?.ingested ?? execution.listings.length,
            errorMessage: null,
            startedAt: sourceStartedAt,
            finishedAt: now(),
          };
          runStorage.recordSourceResult(result);
          results.push(result);
        } catch (error) {
          if (source.kind === 'custom-source') {
            const customSource = customSourceStorage.getById(source.id);
            if (customSource?.name) sourceLabel = customSource.name;
          } else {
            const adapter = providerRegistry.get(source.id);
            if (adapter?.name) sourceLabel = adapter.name;
          }

          const result = {
            runId,
            sourceKind: source.kind,
            sourceId: source.id,
            sourceLabel,
            status: 'failed',
            discoveredCount: 0,
            ingestedCount: 0,
            errorMessage: errorMessage(error),
            startedAt: sourceStartedAt,
            finishedAt: now(),
          };
          runStorage.recordSourceResult(result);
          results.push(result);
        }
      }

      return runStorage.finishRun({
        id: runId,
        status: aggregateStatus(results),
        finishedAt: now(),
      });
    } finally {
      activeProfiles.delete(profile.id);
    }
  };

  return Object.freeze({
    execute({ userId, profileId, trigger = 'manual' } = {}) {
      const ownerId = requiredText(userId, 'userId');
      const id = requiredText(profileId, 'profileId');
      if (!TRIGGERS.has(trigger)) throw new TypeError('trigger must be manual or scheduled');

      const profile = searchProfileStorage.getById(id);
      if (!profile || profile.userId !== ownerId) {
        throw new SearchProfileExecutionAccessError();
      }
      if (activeProfiles.has(id)) throw new SearchProfileRunInProgressError();

      activeProfiles.add(id);
      try {
        const runId = requiredText(idFactory(), 'runId');
        const startedAt = now();
        return executeInternal({ userId: ownerId, profile, trigger, runId, startedAt });
      } catch (error) {
        activeProfiles.delete(id);
        throw error;
      }
    },

    isRunning(profileId) {
      return activeProfiles.has(profileId);
    },
  });
};
