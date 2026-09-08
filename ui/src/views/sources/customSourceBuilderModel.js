const cleanOptional = (value) => {
  if (typeof value !== 'string') return value ?? null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
};

const requiredText = (value) => (typeof value === 'string' ? value.trim() : '');

const integerText = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

export const createEmptySourceForm = () => ({
  sourceId: null,
  name: '',
  mode: 'static',
  url: '',
  listingSelector: '',
  titleSelector: '',
  priceSelector: '',
  urlSelector: '',
  imageSelector: '',
  bedsSelector: '',
  bathsSelector: '',
  addressSelector: '',
  paginationType: 'none',
  maxPages: '1',
  nextSelector: '',
  waitUntil: 'domcontentloaded',
  timeoutMs: '15000',
  waitForSelector: '',
  enabled: false,
  recipeValid: false,
  canEnable: false,
  needsRetest: false,
});

export const recipeFromSourceForm = (form) => {
  const selectors = {
    listing: requiredText(form.listingSelector),
    title: requiredText(form.titleSelector),
    price: requiredText(form.priceSelector),
    url: requiredText(form.urlSelector),
  };

  const optionalSelectors = {
    image: cleanOptional(form.imageSelector),
    beds: cleanOptional(form.bedsSelector),
    baths: cleanOptional(form.bathsSelector),
    address: cleanOptional(form.addressSelector),
  };
  for (const [field, value] of Object.entries(optionalSelectors)) {
    if (value != null) selectors[field] = value;
  }

  const pagination =
    form.paginationType === 'next-button'
      ? {
          type: 'next-button',
          maxPages: integerText(form.maxPages, 5),
          nextSelector: requiredText(form.nextSelector),
        }
      : { type: 'none', maxPages: 1 };

  const recipe = {
    version: 1,
    mode: form.mode === 'browser' ? 'browser' : 'static',
    url: requiredText(form.url),
    selectors,
    pagination,
  };

  if (recipe.mode === 'browser') {
    recipe.browser = {
      waitUntil: cleanOptional(form.waitUntil) ?? 'domcontentloaded',
      timeoutMs: integerText(form.timeoutMs, 15_000),
    };
    const waitForSelector = cleanOptional(form.waitForSelector);
    if (waitForSelector != null) recipe.browser.waitForSelector = waitForSelector;
  }

  return recipe;
};

export const sourceFormFromSource = (source) => {
  const form = createEmptySourceForm();
  const recipe = source?.recipe ?? {};
  const selectors = recipe.selectors ?? {};
  const pagination = recipe.pagination ?? {};
  const browser = recipe.browser ?? {};
  const activation = source?.activation ?? {};

  return {
    ...form,
    sourceId: source?.id ?? null,
    name: source?.name ?? '',
    mode: recipe.mode === 'browser' ? 'browser' : 'static',
    url: recipe.url ?? '',
    listingSelector: selectors.listing ?? '',
    titleSelector: selectors.title ?? '',
    priceSelector: selectors.price ?? '',
    urlSelector: selectors.url ?? '',
    imageSelector: selectors.image ?? '',
    bedsSelector: selectors.beds ?? '',
    bathsSelector: selectors.baths ?? '',
    addressSelector: selectors.address ?? '',
    paginationType: pagination.type === 'next-button' ? 'next-button' : 'none',
    maxPages: String(pagination.maxPages ?? 1),
    nextSelector: pagination.nextSelector ?? '',
    waitUntil: browser.waitUntil ?? 'domcontentloaded',
    timeoutMs: String(browser.timeoutMs ?? 15_000),
    waitForSelector: browser.waitForSelector ?? '',
    enabled: Boolean(source?.enabled),
    recipeValid: Boolean(activation.recipeValid),
    canEnable: Boolean(activation.canEnable),
    needsRetest: Boolean(activation.needsRetest),
  };
};

export const coverageRowsFromReport = (report) => {
  const required = new Set(Array.isArray(report?.requiredFields) ? report.requiredFields : []);
  const coverage = report?.coverage && typeof report.coverage === 'object' ? report.coverage : {};

  return Object.entries(coverage).map(([field, value]) => {
    const present = Number.isInteger(value?.present) ? value.present : 0;
    const total = Number.isInteger(value?.total) ? value.total : 0;
    return {
      field,
      present,
      total,
      required: required.has(field),
      complete: total > 0 && present === total,
    };
  });
};

export const customSourceErrorMessage = (error) => {
  const body = error?.json ?? error ?? {};
  const message = typeof body.message === 'string' && body.message.length > 0 ? body.message : 'Custom Source request failed';
  const context = [body.field, body.step].filter((value) => typeof value === 'string' && value.length > 0);
  return context.length > 0 ? `${message} — ${context.join(' · ')}` : message;
};
