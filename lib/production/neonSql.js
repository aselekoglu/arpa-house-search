const JSON_OIDS = new Set([114, 3802]);
const BOOLEAN_OID = 16;
const INTEGER_OIDS = new Set([20, 21, 23, 26]);
const FLOAT_OIDS = new Set([700, 701, 1700]);

const parseField = (value, oid) => {
  if (value == null) return null;
  if (oid === BOOLEAN_OID) return value === true || value === 't' || value === 'true' || value === '1';
  if (INTEGER_OIDS.has(oid)) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : value;
  }
  if (FLOAT_OIDS.has(oid)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (JSON_OIDS.has(oid)) {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  }
  return value;
};

const serializeParam = (value) => {
  if (value == null) return null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `\\x${value.toString('hex')}`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const neonEndpointFor = (connectionString) => {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new TypeError('DATABASE_URL must be a valid PostgreSQL connection string');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new TypeError('DATABASE_URL must be a PostgreSQL connection string');
  }
  const hostname = parsed.hostname.replace(/^[^.]+\./, 'api.');
  return `https://${hostname}/sql`;
};

const mapRows = (payload) => {
  const fields = Array.isArray(payload?.fields) ? payload.fields : [];
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  return rows.map((row) =>
    Object.fromEntries(
      fields.map((field, index) => [
        field.name,
        parseField(row[index], field.dataTypeID),
      ]),
    ),
  );
};

export const createNeonSqlClient = ({ connectionString = process.env.DATABASE_URL, fetchImpl = fetch } = {}) => {
  if (typeof connectionString !== 'string' || connectionString.length === 0) {
    throw new TypeError('DATABASE_URL is required');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  const endpoint = neonEndpointFor(connectionString);

  const request = async (body) => {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Neon-Connection-String': connectionString,
          'Neon-Raw-Text-Output': 'true',
          'Neon-Array-Mode': 'true',
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new Error('Unable to reach the production database', { cause });
    }

    if (!response.ok) {
      let detail = null;
      try {
        detail = await response.json();
      } catch {
        // Ignore malformed error bodies.
      }
      const message =
        typeof detail?.message === 'string' && detail.message.length > 0
          ? detail.message
          : `Database request failed with HTTP ${response.status}`;
      const error = new Error(message);
      if (detail?.code) error.code = detail.code;
      throw error;
    }

    return response.json();
  };

  return Object.freeze({
    async query(query, params = []) {
      if (typeof query !== 'string' || query.trim().length === 0) {
        throw new TypeError('query must be a non-empty string');
      }
      if (!Array.isArray(params)) throw new TypeError('params must be an array');
      const result = await request({
        query,
        params: params.map(serializeParam),
      });
      return mapRows(result);
    },

    async execute(query, params = []) {
      if (typeof query !== 'string' || query.trim().length === 0) {
        throw new TypeError('query must be a non-empty string');
      }
      const result = await request({
        query,
        params: params.map(serializeParam),
      });
      return {
        rowCount: Number.isInteger(result?.rowCount) ? result.rowCount : 0,
        command: result?.command ?? null,
        rows: mapRows(result),
      };
    },

    async transaction(statements) {
      if (!Array.isArray(statements) || statements.length === 0) {
        throw new TypeError('statements must be a non-empty array');
      }
      const result = await request({
        queries: statements.map(({ query, params = [] }) => ({
          query,
          params: params.map(serializeParam),
        })),
      });
      const results = Array.isArray(result?.results) ? result.results : [];
      return results.map((item) => ({
        rowCount: Number.isInteger(item?.rowCount) ? item.rowCount : 0,
        command: item?.command ?? null,
        rows: mapRows(item),
      }));
    },
  });
};

export { neonEndpointFor };
