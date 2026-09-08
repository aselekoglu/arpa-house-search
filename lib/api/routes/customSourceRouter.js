import { lookup as defaultLookup } from 'node:dns/promises';
import restana from 'restana';
import { StaticCustomSourceExtractor } from '../../providers/custom-source/staticExtractor.js';
import { BrowserCustomSourceExtractor } from '../../providers/custom-source/browserExtractor.js';
import { CustomSourceRecipeError } from '../../providers/custom-source/recipe.js';
import { CustomSourceExtractionError, CustomSourceNetworkError } from '../../providers/custom-source/errors.js';
import * as customSourceStorage from '../../services/storage/customSourceStorage.js';
import { createCustomSourceTestService } from '../../services/customSources/sourceTestService.js';
import {
  createCustomSourceLifecycleService,
  CustomSourceActivationError,
  CustomSourceNotFoundError,
  CustomSourceOwnershipError,
} from '../../services/customSources/sourceLifecycleService.js';

const httpError = (status, error, extra = {}) => ({
  status,
  body: {
    error: error.name,
    message: error.message,
    ...extra,
  },
});

export const toCustomSourceHttpError = (error) => {
  if (error instanceof CustomSourceNetworkError) {
    return httpError(502, error, {
      field: error.field,
      step: error.step,
      upstreamStatus: error.status ?? null,
    });
  }
  if (error instanceof CustomSourceExtractionError) {
    return httpError(422, error, { field: error.field, step: error.step });
  }
  if (error instanceof CustomSourceRecipeError) {
    return httpError(422, error, { field: error.field });
  }
  if (error instanceof CustomSourceOwnershipError) return httpError(403, error);
  if (error instanceof CustomSourceNotFoundError) return httpError(404, error);
  if (error instanceof CustomSourceActivationError) return httpError(409, error);
  if (error instanceof TypeError) return httpError(400, error);

  return {
    status: 500,
    body: {
      error: 'InternalServerError',
      message: 'Custom Source request failed',
    },
  };
};

const currentUserId = (req) => {
  const userId = req?.session?.currentUser;
  if (typeof userId !== 'string' || userId.length === 0) throw new CustomSourceOwnershipError('No authenticated user');
  return userId;
};

const respond = async (res, operation) => {
  try {
    const data = await operation();
    res.send(data);
  } catch (error) {
    const mapped = toCustomSourceHttpError(error);
    res.send(mapped.body, mapped.status);
  }
};

export const createCustomSourceHandlers = ({ lifecycle } = {}) => {
  if (lifecycle == null || typeof lifecycle.listSources !== 'function') {
    throw new TypeError('lifecycle must implement the Custom Source lifecycle contract');
  }

  return Object.freeze({
    async list(req, res) {
      await respond(res, () => lifecycle.listSources({ userId: currentUserId(req) }));
    },

    async save(req, res) {
      await respond(res, () =>
        lifecycle.saveDraft({
          userId: currentUserId(req),
          sourceId: req.body?.sourceId ?? null,
          name: req.body?.name,
          recipe: req.body?.recipe,
        }),
      );
    },

    async test(req, res) {
      await respond(res, () =>
        lifecycle.testSource({
          userId: currentUserId(req),
          sourceId: req.params?.sourceId,
        }),
      );
    },

    async setStatus(req, res) {
      await respond(res, () => {
        if (typeof req.body?.enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
        return lifecycle.setEnabled({
          userId: currentUserId(req),
          sourceId: req.params?.sourceId,
          enabled: req.body.enabled,
        });
      });
    },

    async remove(req, res) {
      await respond(res, () => {
        const sourceId = req.params?.sourceId;
        lifecycle.removeSource({ userId: currentUserId(req), sourceId });
        return { deleted: true, id: sourceId };
      });
    },
  });
};

const staticExtractor = new StaticCustomSourceExtractor();
const browserExtractor = new BrowserCustomSourceExtractor({ lookup: defaultLookup });
const sourceTestService = createCustomSourceTestService({ staticExtractor, browserExtractor });
const lifecycle = createCustomSourceLifecycleService({
  storage: customSourceStorage,
  testService: sourceTestService,
});

const service = restana();
const customSourceRouter = service.newRouter();
const handlers = createCustomSourceHandlers({ lifecycle });

customSourceRouter.get('/', handlers.list);
customSourceRouter.post('/', handlers.save);
customSourceRouter.post('/:sourceId/test', handlers.test);
customSourceRouter.put('/:sourceId/status', handlers.setStatus);
customSourceRouter.delete('/:sourceId', handlers.remove);

export { customSourceRouter };
