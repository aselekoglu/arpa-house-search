import restana from 'restana';
import * as searchProfileStorage from '../../services/storage/searchProfileStorage.js';
import * as customSourceStorage from '../../services/storage/customSourceStorage.js';
import {
  createSearchProfileLifecycleService,
  SearchProfileNotFoundError,
  SearchProfileOwnershipError,
} from '../../services/searchProfiles/searchProfileLifecycleService.js';
import { createProfileExecutionContext } from '../../services/searchProfiles/profileExecutionContext.js';
import {
  SearchProfileExecutionAccessError,
  SearchProfileRunInProgressError,
} from '../../services/searchProfiles/searchProfileExecutionService.js';
import { searchProfileExecutionService } from '../../services/searchProfiles/searchProfileRuntime.js';

const httpError = (status, error) => ({
  status,
  body: {
    error: error.name,
    message: error.message,
  },
});

export const toSearchProfileHttpError = (error) => {
  if (error instanceof SearchProfileOwnershipError) return httpError(403, error);
  if (error instanceof SearchProfileExecutionAccessError) return httpError(403, error);
  if (error instanceof SearchProfileRunInProgressError) return httpError(409, error);
  if (error instanceof SearchProfileNotFoundError) return httpError(404, error);
  if (error instanceof TypeError) return httpError(400, error);

  return {
    status: 500,
    body: {
      error: 'InternalServerError',
      message: 'Search Profile request failed',
    },
  };
};

const currentUserId = (req) => {
  const userId = req?.session?.currentUser;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new SearchProfileOwnershipError('No authenticated user');
  }
  return userId;
};

const respond = async (res, operation) => {
  try {
    const data = await operation();
    res.send(data);
  } catch (error) {
    const mapped = toSearchProfileHttpError(error);
    res.send(mapped.body, mapped.status);
  }
};

export const createSearchProfileHandlers = ({
  lifecycle,
  contextMapper = createProfileExecutionContext,
  executionService = searchProfileExecutionService,
} = {}) => {
  if (
    lifecycle == null ||
    typeof lifecycle.listProfiles !== 'function' ||
    typeof lifecycle.saveProfile !== 'function' ||
    typeof lifecycle.getProfile !== 'function' ||
    typeof lifecycle.removeProfile !== 'function'
  ) {
    throw new TypeError('lifecycle must implement the Search Profile lifecycle contract');
  }
  if (typeof contextMapper !== 'function') throw new TypeError('contextMapper must be a function');
  if (executionService == null || typeof executionService.execute !== 'function') {
    throw new TypeError('executionService must expose execute()');
  }

  return Object.freeze({
    async list(req, res) {
      await respond(res, () => lifecycle.listProfiles({ userId: currentUserId(req) }));
    },

    async save(req, res) {
      await respond(res, () =>
        lifecycle.saveProfile({
          userId: currentUserId(req),
          profileId: req.body?.profileId ?? null,
          name: req.body?.name,
          city: req.body?.city,
          region: req.body?.region,
          maxPrice: req.body?.maxPrice,
          minBedrooms: req.body?.minBedrooms,
          minBathrooms: req.body?.minBathrooms,
          enabledSources: req.body?.enabledSources,
          schedule: req.body?.schedule,
        }),
      );
    },

    async executionContext(req, res) {
      await respond(res, () => {
        const profile = lifecycle.getProfile({
          userId: currentUserId(req),
          profileId: req.params?.profileId,
        });
        return contextMapper(profile);
      });
    },

    async runNow(req, res) {
      await respond(res, () =>
        executionService.execute({
          userId: currentUserId(req),
          profileId: req.params?.profileId,
          trigger: 'manual',
        }),
      );
    },

    async remove(req, res) {
      await respond(res, () => {
        const profileId = req.params?.profileId;
        lifecycle.removeProfile({ userId: currentUserId(req), profileId });
        return { deleted: true, id: profileId };
      });
    },
  });
};

const lifecycle = createSearchProfileLifecycleService({
  storage: searchProfileStorage,
  customSourceStorage,
});
const service = restana();
const searchProfileRouter = service.newRouter();
const handlers = createSearchProfileHandlers({
  lifecycle,
  executionService: searchProfileExecutionService,
});

searchProfileRouter.get('/', handlers.list);
searchProfileRouter.post('/', handlers.save);
searchProfileRouter.get('/:profileId/execution-context', handlers.executionContext);
searchProfileRouter.post('/:profileId/run', handlers.runNow);
searchProfileRouter.delete('/:profileId', handlers.remove);

export { searchProfileRouter };
