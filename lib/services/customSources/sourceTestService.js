import crypto from 'node:crypto';
import { validateCustomSourceRecipe } from '../../providers/custom-source/recipe.js';

export const REQUIRED_SOURCE_FIELDS = Object.freeze(['title', 'price', 'url']);
export const COVERAGE_FIELDS = Object.freeze(['title', 'price', 'url', 'image', 'beds', 'baths', 'address']);

const isPresent = (value) => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

export const computeCoverage = (records) => {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');
  const total = records.length;
  const coverage = {};

  for (const field of COVERAGE_FIELDS) {
    let present = 0;
    for (const record of records) {
      if (record != null && typeof record === 'object' && isPresent(record[field])) present += 1;
    }
    coverage[field] = { present, total };
  }

  return coverage;
};

export const hashNormalizedRecipe = (normalizedRecipe) =>
  crypto.createHash('sha256').update(JSON.stringify(normalizedRecipe)).digest('hex');

const validateExtractor = (extractor, name) => {
  if (extractor == null || typeof extractor.extract !== 'function') {
    throw new TypeError(`${name} must expose extract(recipe)`);
  }
  return extractor;
};

const validatePreviewLimit = (value) => {
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new TypeError('previewLimit must be an integer between 1 and 50');
  }
  return value;
};

export const createCustomSourceTestService = ({ staticExtractor, browserExtractor, previewLimit = 10 } = {}) => {
  const extractors = {
    static: validateExtractor(staticExtractor, 'staticExtractor'),
    browser: validateExtractor(browserExtractor, 'browserExtractor'),
  };
  const boundedPreviewLimit = validatePreviewLimit(previewLimit);

  return Object.freeze({
    async test(inputRecipe) {
      const normalizedRecipe = validateCustomSourceRecipe(inputRecipe);
      const extraction = await extractors[normalizedRecipe.mode].extract(normalizedRecipe);
      const records = Array.isArray(extraction?.records) ? extraction.records : [];
      const coverage = computeCoverage(records);
      const activationReady =
        records.length > 0 &&
        REQUIRED_SOURCE_FIELDS.every((field) => coverage[field].present === coverage[field].total);

      return {
        recipeHash: hashNormalizedRecipe(normalizedRecipe),
        normalizedRecipe,
        requiredFields: [...REQUIRED_SOURCE_FIELDS],
        activationReady,
        totalRecords: records.length,
        pagesFetched: Number.isInteger(extraction?.pagesFetched) ? extraction.pagesFetched : 0,
        coverage,
        preview: records.slice(0, boundedPreviewLimit),
      };
    },
  });
};
