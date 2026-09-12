import { xhrDelete, xhrGet, xhrPost } from './xhr.js';

const body = (response) => response?.json ?? response;

export const listSearchProfiles = async () => body(await xhrGet('/api/searchProfiles'));

export const saveSearchProfile = async (profile) =>
  body(await xhrPost('/api/searchProfiles', profile));

export const deleteSearchProfile = async (profileId) =>
  body(await xhrDelete(`/api/searchProfiles/${profileId}`, {}));

export const getSearchProfileExecutionContext = async (profileId) =>
  body(await xhrGet(`/api/searchProfiles/${profileId}/execution-context`));
