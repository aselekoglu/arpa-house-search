export class RealtorError extends Error {
  constructor(message, { code = 'REALTOR_ERROR', field = null, status = null, cause = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.field = field;
    this.status = status;
    if (cause != null) this.cause = cause;
  }
}

export class RealtorChallengeError extends RealtorError {
  constructor(message = 'Realtor.ca requires an interactive browser challenge', options = {}) {
    super(message, { ...options, code: 'REALTOR_CHALLENGE' });
  }
}

export class RealtorLocationError extends RealtorError {
  constructor(message, options = {}) {
    super(message, { ...options, code: 'REALTOR_LOCATION' });
  }
}

export class RealtorResponseError extends RealtorError {
  constructor(message, options = {}) {
    super(message, { ...options, code: 'REALTOR_RESPONSE' });
  }
}

export class RealtorTransportError extends RealtorError {
  constructor(message, options = {}) {
    super(message, { ...options, code: 'REALTOR_TRANSPORT' });
  }
}
