export const LISTING_FEED_SORT_OPTIONS = Object.freeze([
  Object.freeze({ value: 'newest', label: 'Newest' }),
  Object.freeze({ value: 'price-asc', label: 'Price: low to high' }),
  Object.freeze({ value: 'price-desc', label: 'Price: high to low' }),
]);

const number = (value, maximumFractionDigits = 0) =>
  new Intl.NumberFormat('en-CA', {
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }).format(value);

export const formatListingPrice = (price, currency) => {
  if (!Number.isFinite(price)) return 'Price unavailable';
  const decimals = Number.isInteger(price) ? 0 : 2;
  const formatted = number(price, decimals);
  if (currency === 'CAD') return `$${formatted}`;
  if (typeof currency === 'string' && currency.trim().length > 0) {
    return `${currency.trim().toUpperCase()} ${formatted}`;
  }
  return formatted;
};

export const formatListingFreshness = (firstSeen, now = Date.now()) => {
  if (!Number.isFinite(firstSeen) || !Number.isFinite(now) || now < firstSeen) {
    return 'Freshness unknown';
  }

  const day = 24 * 60 * 60 * 1000;
  const age = now - firstSeen;
  if (age < day) return 'New';
  return `${Math.floor(age / day)}d ago`;
};

export const listingFeedErrorMessage = (error) => {
  if (typeof error === 'string' && error.length > 0) return error;
  const message = error?.json?.message ?? error?.message;
  return typeof message === 'string' && message.length > 0
    ? message
    : 'Listing Feed request failed';
};
