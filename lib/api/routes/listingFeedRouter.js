import restana from 'restana';
import * as canonicalListingStorage from '../../services/storage/canonicalListingStorage.js';
import * as searchProfileStorage from '../../services/storage/searchProfileStorage.js';
import * as customSourceStorage from '../../services/storage/customSourceStorage.js';
import {
  createListingFeedService,
  ListingFeedAccessError,
  ListingFeedSourceError,
} from '../../services/listingFeed/listingFeedService.js';

const httpError = (status, error) => ({
  status,
  body: {
    error: error.name,
    message: error.message,
  },
});

export const toListingFeedHttpError = (error) => {
  if (error instanceof ListingFeedAccessError) return httpError(403, error);
  if (error instanceof ListingFeedSourceError) return httpError(409, error);
  if (error instanceof TypeError) return httpError(400, error);

  return {
    status: 500,
    body: {
      error: 'InternalServerError',
      message: 'Listing Feed request failed',
    },
  };
};

const currentUserId = (req) => {
  const userId = req?.session?.currentUser;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new ListingFeedAccessError('No authenticated user');
  }
  return userId;
};

const respond = async (res, operation) => {
  try {
    const data = await operation();
    res.send(data);
  } catch (error) {
    const mapped = toListingFeedHttpError(error);
    res.send(mapped.body, mapped.status);
  }
};

export const createListingFeedHandlers = ({ service } = {}) => {
  if (service == null || typeof service.query !== 'function') {
    throw new TypeError('service must implement the Listing Feed query contract');
  }

  return Object.freeze({
    async list(req, res) {
      await respond(res, () =>
        service.query({
          userId: currentUserId(req),
          profileId: req.query?.profileId,
          sort: req.query?.sort ?? 'newest',
        }),
      );
    },
  });
};

const feedService = createListingFeedService({
  storage: canonicalListingStorage,
  searchProfileStorage,
  customSourceStorage,
});

const service = restana();
const listingFeedRouter = service.newRouter();
const handlers = createListingFeedHandlers({ service: feedService });

listingFeedRouter.get('/', handlers.list);

export { listingFeedRouter };
