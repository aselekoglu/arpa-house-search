import { xhrGet } from './xhr.js';

const body = (response) => response?.json ?? response;
const LISTING_FEED_ENDPOINT = '/api/listing-feed?';

export const getListingFeed = async ({ profileId, sort = 'newest' } = {}) => {
  const params = new URLSearchParams({
    profileId: profileId ?? '',
    sort,
  });
  return body(await xhrGet(`${LISTING_FEED_ENDPOINT}${params.toString()}`));
};
