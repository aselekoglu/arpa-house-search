import { lookup } from 'node:dns/promises';
import { ProviderRegistry } from '../../providers/core/ProviderRegistry.js';
import { createRealtorCaAdapter } from '../../providers/adapters/realtor-ca.js';
import { StaticCustomSourceExtractor } from '../../providers/custom-source/staticExtractor.js';
import { BrowserCustomSourceExtractor } from '../../providers/custom-source/browserExtractor.js';
import * as searchProfileStorage from '../storage/searchProfileStorage.js';
import * as customSourceStorage from '../storage/customSourceStorage.js';
import * as canonicalListingStorage from '../storage/canonicalListingStorage.js';
import * as searchProfileRunStorage from '../storage/searchProfileRunStorage.js';
import { createListingFeedService } from '../listingFeed/listingFeedService.js';
import { createSearchProfileExecutionService } from './searchProfileExecutionService.js';
import { createSearchProfileScheduler } from './searchProfileScheduler.js';

export const searchProfileProviderRegistry = new ProviderRegistry([
  createRealtorCaAdapter(),
]);

export const staticCustomSourceExtractor = new StaticCustomSourceExtractor({
  lookup,
});

export const browserCustomSourceExtractor = new BrowserCustomSourceExtractor({
  lookup,
});

export const searchProfileListingFeedService = createListingFeedService({
  storage: canonicalListingStorage,
  searchProfileStorage,
  customSourceStorage,
});

export const searchProfileExecutionService = createSearchProfileExecutionService({
  searchProfileStorage,
  customSourceStorage,
  providerRegistry: searchProfileProviderRegistry,
  staticExtractor: staticCustomSourceExtractor,
  browserExtractor: browserCustomSourceExtractor,
  listingFeedService: searchProfileListingFeedService,
  runStorage: searchProfileRunStorage,
});

export const searchProfileScheduler = createSearchProfileScheduler({
  searchProfileStorage,
  runStorage: searchProfileRunStorage,
  executionService: searchProfileExecutionService,
});
