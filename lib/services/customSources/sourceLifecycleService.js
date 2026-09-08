import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import { validateCustomSourceRecipe } from '../../providers/custom-source/recipe.js';
import { hashNormalizedRecipe } from './sourceTestService.js';

export class CustomSourceOwnershipError extends Error {
  constructor(message = 'Custom Source does not belong to the current user') {
    super(message);
    this.name = 'CustomSourceOwnershipError';
  }
}

export class CustomSourceActivationError extends Error {
  constructor(message = 'Custom Source must pass Test Extraction for the current recipe before activation') {
    super(message);
    this.name = 'CustomSourceActivationError';
  }
}

export class CustomSourceNotFoundError extends Error {
  constructor(message = 'Custom Source was not found') {
    super(message);
    this.name = 'CustomSourceNotFoundError';
  }
}

const stableJson = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
};

const hashDraft = (recipe) => crypto.createHash('sha256').update(stableJson(recipe)).digest('hex');

const normalizeName = (name) => {
  if (typeof name !== 'string' || name.trim().length === 0) throw new TypeError('name must be a non-empty string');
  const normalized = name.trim();
  if (normalized.length > 120) throw new TypeError('name must be at most 120 characters');
  return normalized;
};

const validateDraftRecipe = (recipe) => {
  if (recipe == null || typeof recipe !== 'object' || Array.isArray(recipe)) {
    throw new TypeError('recipe must be an object');
  }
  const serialized = stableJson(recipe);
  if (serialized.length > 65_536) throw new TypeError('recipe must be at most 65536 serialized characters');
  return structuredClone(recipe);
};

const defaultNormalizeAndHash = (recipe) => hashNormalizedRecipe(validateCustomSourceRecipe(recipe));

export const createCustomSourceLifecycleService = ({
  storage,
  testService,
  normalizeAndHash = defaultNormalizeAndHash,
  idFactory = nanoid,
  now = Date.now,
} = {}) => {
  if (storage == null || typeof storage.getById !== 'function' || typeof storage.upsert !== 'function') {
    throw new TypeError('storage must implement the Custom Source storage contract');
  }
  if (testService == null || typeof testService.test !== 'function') {
    throw new TypeError('testService must expose test(recipe)');
  }
  if (typeof normalizeAndHash !== 'function') throw new TypeError('normalizeAndHash must be a function');
  if (typeof idFactory !== 'function') throw new TypeError('idFactory must be a function');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const ownedSource = (userId, sourceId) => {
    const source = storage.getById(sourceId);
    if (!source) throw new CustomSourceNotFoundError();
    if (source.userId !== userId) throw new CustomSourceOwnershipError();
    return source;
  };

  const service = {
    listSources({ userId }) {
      return storage.listByUser(userId);
    },

    getSource({ userId, sourceId }) {
      return ownedSource(userId, sourceId);
    },

    saveDraft({ userId, sourceId = null, name, recipe }) {
      if (typeof userId !== 'string' || userId.length === 0) throw new TypeError('userId is required');
      const normalizedName = normalizeName(name);
      const draftRecipe = validateDraftRecipe(recipe);
      const draftHash = hashDraft(draftRecipe);
      const timestamp = now();

      let existing = null;
      if (sourceId != null) existing = ownedSource(userId, sourceId);

      const id = existing?.id ?? sourceId ?? idFactory();
      const recipeChanged = existing != null && existing.draftHash !== draftHash;
      const row = {
        ...existing,
        id,
        userId,
        name: normalizedName,
        recipe: draftRecipe,
        draftHash,
        enabled: existing ? (recipeChanged ? false : Boolean(existing.enabled)) : false,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };

      return storage.upsert(row);
    },

    async testSource({ userId, sourceId }) {
      const source = ownedSource(userId, sourceId);
      const report = await testService.test(source.recipe);
      const timestamp = now();
      storage.recordTest({
        id: source.id,
        lastTestRecipeHash: report.recipeHash,
        lastTestStatus: report.activationReady ? 'pass' : 'fail',
        lastTestReport: report,
        lastTestedAt: timestamp,
        updatedAt: timestamp,
      });
      return report;
    },

    setEnabled({ userId, sourceId, enabled }) {
      const source = ownedSource(userId, sourceId);
      const shouldEnable = Boolean(enabled);

      if (shouldEnable) {
        let currentRecipeHash;
        try {
          currentRecipeHash = normalizeAndHash(source.recipe);
        } catch (cause) {
          throw new CustomSourceActivationError(`Current Custom Source recipe is not valid: ${cause.message}`);
        }
        if (source.lastTestStatus !== 'pass' || source.lastTestRecipeHash !== currentRecipeHash) {
          throw new CustomSourceActivationError();
        }
      }

      return storage.setEnabled({ id: source.id, enabled: shouldEnable, updatedAt: now() });
    },

    removeSource({ userId, sourceId }) {
      const source = ownedSource(userId, sourceId);
      storage.remove(source.id);
    },
  };

  return Object.freeze(service);
};
