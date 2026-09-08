import { RealtorError, RealtorLocationError, RealtorResponseError } from './errors.js';

const COMMON = Object.freeze({
  ApplicationId: '1',
  CultureId: '1',
  Version: '7.0',
});

const requiredText = (value, field) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RealtorError(`${field} must be a non-empty string`, { field });
  }
  return value.trim();
};

const optionalNumber = (value, field) => {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new RealtorError(`${field} must be a non-negative finite number`, { field });
  }
  return number;
};

const optionalInteger = (value, field) => {
  const number = optionalNumber(value, field);
  if (number == null) return null;
  if (!Number.isInteger(number)) {
    throw new RealtorError(`${field} must be a non-negative integer`, { field });
  }
  return number;
};

const boundedInteger = (value, field, { defaultValue, min, max }) => {
  const number = value == null ? defaultValue : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new RealtorError(`${field} must be an integer between ${min} and ${max}`, { field });
  }
  return number;
};

const minimumRange = (value) => (value == null || value < 1 ? null : `${value}-0`);

const viewportFromSubArea = (subArea) => {
  const northEast = subArea?.Viewport?.NorthEast;
  const southWest = subArea?.Viewport?.SouthWest;
  const values = {
    LatitudeMax: northEast?.Latitude,
    LongitudeMax: northEast?.Longitude,
    LatitudeMin: southWest?.Latitude,
    LongitudeMin: southWest?.Longitude,
  };

  for (const [field, value] of Object.entries(values)) {
    if (!Number.isFinite(Number(value))) {
      throw new RealtorLocationError(`Realtor.ca returned an invalid ${field} for the requested area`);
    }
  }

  return Object.fromEntries(Object.entries(values).map(([field, value]) => [field, String(Number(value))]));
};

const totalRecordsFromPayload = (payload, fallback) => {
  const value = Number(payload?.Paging?.TotalRecords);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

export class RealtorClient {
  constructor({ transport } = {}) {
    if (transport == null || typeof transport.request !== 'function') {
      throw new RealtorError('RealtorClient requires a transport with request(request)', { field: 'transport' });
    }
    this.transport = transport;
  }

  async geocodeArea(area) {
    const normalizedArea = requiredText(area, 'area');
    const payload = await this.transport.request({
      method: 'GET',
      path: '/Location.svc/SubAreaSearch',
      query: {
        Area: normalizedArea,
        CurrentPage: '1',
        ...COMMON,
      },
    });

    if (!Array.isArray(payload?.SubArea) || payload.SubArea.length === 0) {
      throw new RealtorLocationError(`Realtor.ca could not resolve area: ${normalizedArea}`, { field: 'area' });
    }

    const subArea = payload.SubArea[0];
    return {
      location: typeof subArea.Location === 'string' && subArea.Location.trim() ? subArea.Location.trim() : normalizedArea,
      geoId: typeof subArea.GEOId === 'string' ? subArea.GEOId.trim() : '',
      viewport: viewportFromSubArea(subArea),
    };
  }

  async searchRentals({
    area,
    minPrice = null,
    maxPrice = null,
    minBeds = null,
    minBaths = null,
    maxPages = 3,
    recordsPerPage = 20,
  } = {}) {
    const normalizedArea = requiredText(area, 'area');
    const normalizedMinPrice = optionalNumber(minPrice, 'minPrice');
    const normalizedMaxPrice = optionalNumber(maxPrice, 'maxPrice');
    const normalizedMinBeds = optionalInteger(minBeds, 'minBeds');
    const normalizedMinBaths = optionalInteger(minBaths, 'minBaths');
    const normalizedMaxPages = boundedInteger(maxPages, 'maxPages', { defaultValue: 3, min: 1, max: 50 });
    const normalizedRecordsPerPage = boundedInteger(recordsPerPage, 'recordsPerPage', {
      defaultValue: 20,
      min: 1,
      max: 100,
    });

    if (normalizedMinPrice != null && normalizedMaxPrice != null && normalizedMinPrice > normalizedMaxPrice) {
      throw new RealtorError('minPrice cannot be greater than maxPrice', { field: 'priceRange' });
    }

    const geo = await this.geocodeArea(normalizedArea);
    const baseForm = {
      PropertyTypeGroupID: '1',
      TransactionTypeId: '3',
      PropertySearchTypeId: '0',
      Sort: '6-D',
      Currency: 'CAD',
      IncludeHiddenListings: 'false',
      RecordsPerPage: String(normalizedRecordsPerPage),
      GeoIds: geo.geoId,
      ...geo.viewport,
      ...COMMON,
    };

    if (normalizedMinPrice != null) baseForm.RentMin = String(normalizedMinPrice);
    if (normalizedMaxPrice != null) baseForm.RentMax = String(normalizedMaxPrice);
    const bedRange = minimumRange(normalizedMinBeds);
    const bathRange = minimumRange(normalizedMinBaths);
    if (bedRange) baseForm.BedRange = bedRange;
    if (bathRange) baseForm.BathRange = bathRange;

    const results = [];
    let totalRecords = 0;
    let fetchedPages = 0;

    for (let page = 1; page <= normalizedMaxPages; page += 1) {
      const payload = await this.transport.request({
        method: 'POST',
        path: '/Listing.svc/AsyncPropertySearch_Post',
        form: {
          ...baseForm,
          CurrentPage: String(page),
        },
      });

      if (!Array.isArray(payload?.Results)) {
        throw new RealtorResponseError('Realtor.ca search response did not include a Results array');
      }

      fetchedPages = page;
      results.push(...payload.Results);
      totalRecords = totalRecordsFromPayload(payload, results.length);

      if (payload.Results.length === 0 || results.length >= totalRecords) break;
    }

    return {
      location: geo.location,
      results,
      paging: {
        fetchedPages,
        totalRecords,
        hasMore: results.length < totalRecords,
      },
    };
  }

  async close() {
    if (typeof this.transport.close === 'function') await this.transport.close();
  }
}
