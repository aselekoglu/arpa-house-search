import { expect } from 'chai';

const loadModule = async () => import('../../lib/production/neonSql.js').catch(() => null);

describe('production Neon HTTP SQL client', () => {
  it('exports a parameterized client without external driver dependencies', async () => {
    const mod = await loadModule();
    expect(mod, 'production Neon SQL client should exist').to.not.equal(null);
    if (!mod) return;
    expect(mod.createNeonSqlClient).to.be.a('function');
  });

  it('posts parameterized SQL to the Neon HTTP endpoint and maps typed rows', async () => {
    const mod = await loadModule();
    if (!mod) return;

    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            fields: [
              { name: 'id', dataTypeID: 25 },
              { name: 'enabled', dataTypeID: 16 },
              { name: 'price', dataTypeID: 701 },
              { name: 'meta', dataTypeID: 3802 },
            ],
            rows: [['abc', 't', '2195.5', '{"city":"Ottawa"}']],
            rowCount: 1,
            command: 'SELECT',
          };
        },
      };
    };

    const client = mod.createNeonSqlClient({
      connectionString: 'postgresql://owner:secret@ep-test.us-east-1.aws.neon.tech/neondb?sslmode=require',
      fetchImpl,
    });
    const rows = await client.query(
      'SELECT $1::text AS id, $2::boolean AS enabled',
      ['abc', true],
    );

    expect(calls).to.have.length(1);
    expect(calls[0].url).to.equal('https://api.us-east-1.aws.neon.tech/sql');
    expect(calls[0].options.headers['Neon-Connection-String']).to.include('postgresql://owner:secret@');
    expect(JSON.parse(calls[0].options.body)).to.deep.equal({
      query: 'SELECT $1::text AS id, $2::boolean AS enabled',
      params: ['abc', 'true'],
    });
    expect(rows).to.deep.equal([
      { id: 'abc', enabled: true, price: 2195.5, meta: { city: 'Ottawa' } },
    ]);
  });

  it('does not expose credentials in database errors', async () => {
    const mod = await loadModule();
    if (!mod) return;
    const client = mod.createNeonSqlClient({
      connectionString: 'postgresql://owner:super-secret@ep-test.us-east-1.aws.neon.tech/neondb',
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        async json() { return { message: 'relation does not exist', code: '42P01' }; },
        async text() { return 'bad request'; },
      }),
    });

    let error;
    try {
      await client.query('SELECT * FROM missing');
    } catch (cause) {
      error = cause;
    }
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.include('relation does not exist');
    expect(error.message).to.not.include('super-secret');
  });
});
