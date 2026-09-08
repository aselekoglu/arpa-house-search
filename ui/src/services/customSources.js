import { xhrDelete, xhrGet, xhrPost, xhrPut } from './xhr.js';

const body = (response) => response?.json ?? response;

export const listCustomSources = async () => body(await xhrGet('/api/sources'));

export const saveCustomSourceDraft = async ({ sourceId = null, name, recipe }) =>
  body(await xhrPost('/api/sources', { sourceId, name, recipe }));

export const testCustomSource = async (sourceId) =>
  body(await xhrPost(`/api/sources/${sourceId}/test`, {}));

export const setCustomSourceEnabled = async (sourceId, enabled) =>
  body(await xhrPut(`/api/sources/${sourceId}/status`, { enabled }));

export const deleteCustomSource = async (sourceId) =>
  body(await xhrDelete(`/api/sources/${sourceId}`, {}));
