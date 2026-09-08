export class CustomSourceExtractionError extends Error {
  constructor(field, message, { step = 'extract', cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'CustomSourceExtractionError';
    this.field = field;
    this.step = step;
  }
}

export class CustomSourceNetworkError extends CustomSourceExtractionError {
  constructor(message, { field = 'url', step = 'fetch', status = null, url = null, cause = null } = {}) {
    super(field, message, { step, cause });
    this.name = 'CustomSourceNetworkError';
    this.status = status;
    this.url = url;
  }
}
