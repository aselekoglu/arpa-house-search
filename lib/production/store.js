const json = (value, fallback = null) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

const sourceRow = (row) => row && ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  enabled: Boolean(row.enabled),
  recipe: json(row.recipe, {}),
  lastTestRecipeHash: row.last_test_recipe_hash ?? null,
  lastTestReport: json(row.last_test_report, null),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const profileRow = (row) => row && ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  city: row.city,
  region: row.region,
  maxPrice: row.max_price ?? null,
  minBedrooms: row.min_bedrooms ?? null,
  minBathrooms: row.min_bathrooms ?? null,
  enabledSources: json(row.enabled_sources, []),
  schedule: json(row.schedule, { enabled: false, intervalMinutes: 15 }),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const runSourceRow = (row) => ({
  runId: row.run_id,
  sourceKind: row.source_kind,
  sourceId: row.source_id,
  sourceLabel: row.source_label,
  status: row.status,
  discoveredCount: row.discovered_count,
  ingestedCount: row.ingested_count,
  errorMessage: row.error_message ?? null,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

const runRow = async (client, row) => {
  if (!row) return null;
  const sources = await client.query(
    `SELECT run_id, source_kind, source_id, source_label, status,
            discovered_count, ingested_count, error_message, started_at, finished_at
       FROM search_profile_run_sources
      WHERE run_id = $1
      ORDER BY started_at ASC, source_kind ASC, source_id ASC`,
    [row.id],
  );
  return {
    id: row.id,
    profileId: row.profile_id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    sources: sources.map(runSourceRow),
  };
};

const feedRow = (row) => ({
  profileId: row.profile_id,
  listingId: row.listing_id,
  sourceKind: row.source_kind,
  sourceId: row.source_id,
  sourceLabel: row.source_label,
  id: row.listing_id,
  providerId: row.provider_id,
  sourceListingId: row.source_listing_id,
  url: row.url,
  title: row.title ?? null,
  price: row.price ?? null,
  currency: row.currency ?? null,
  beds: row.beds ?? null,
  baths: row.baths ?? null,
  address: row.address ?? null,
  latitude: row.latitude ?? null,
  longitude: row.longitude ?? null,
  imageUrl: row.image_url ?? null,
  description: row.description ?? null,
  raw: json(row.raw_json, null),
  firstSeen: row.hit_first_seen,
  lastSeen: row.hit_last_seen,
});

const PROFILE_FIELDS = `
  id, user_id, name, city, region, max_price, min_bedrooms, min_bathrooms,
  enabled_sources, schedule, created_at, updated_at
`;

export const createProductionStore = (client) => {
  if (client == null || typeof client.query !== 'function' || typeof client.execute !== 'function') {
    throw new TypeError('client must expose query() and execute()');
  }

  return Object.freeze({
    async getUserById(id) {
      const rows = await client.query(
        'SELECT id, username, password_hash, is_admin, last_login FROM users WHERE id = $1 LIMIT 1',
        [id],
      );
      return rows[0] ?? null;
    },

    async getUserByUsername(username) {
      const rows = await client.query(
        'SELECT id, username, password_hash, is_admin, last_login FROM users WHERE username = $1 LIMIT 1',
        [username],
      );
      return rows[0] ?? null;
    },

    async touchUserLogin(id, now) {
      await client.execute('UPDATE users SET last_login = $2 WHERE id = $1', [id, now]);
    },

    async listSources(userId) {
      const rows = await client.query(
        `SELECT id, user_id, name, enabled, recipe, last_test_recipe_hash, last_test_report, created_at, updated_at
           FROM custom_sources WHERE user_id = $1 ORDER BY updated_at DESC, name ASC`,
        [userId],
      );
      return rows.map(sourceRow);
    },

    async getSource(id) {
      const rows = await client.query(
        `SELECT id, user_id, name, enabled, recipe, last_test_recipe_hash, last_test_report, created_at, updated_at
           FROM custom_sources WHERE id = $1 LIMIT 1`,
        [id],
      );
      return sourceRow(rows[0]);
    },

    async saveSource({ id, userId, name, recipe, disable = false, now }) {
      const rows = await client.query(
        `INSERT INTO custom_sources (
           id, user_id, name, enabled, recipe, created_at, updated_at
         ) VALUES ($1, $2, $3, FALSE, $4::jsonb, $5, $5)
         ON CONFLICT(id) DO UPDATE SET
           name = EXCLUDED.name,
           recipe = EXCLUDED.recipe,
           enabled = CASE WHEN $6::boolean THEN FALSE ELSE custom_sources.enabled END,
           updated_at = EXCLUDED.updated_at
         WHERE custom_sources.user_id = EXCLUDED.user_id
         RETURNING id, user_id, name, enabled, recipe, last_test_recipe_hash, last_test_report, created_at, updated_at`,
        [id, userId, name, recipe, now, disable],
      );
      return sourceRow(rows[0]);
    },

    async updateSourceTest({ id, userId, recipeHash, report, now }) {
      const rows = await client.query(
        `UPDATE custom_sources
            SET last_test_recipe_hash = $3,
                last_test_report = $4::jsonb,
                enabled = CASE WHEN ($4::jsonb ->> 'activationReady')::boolean THEN enabled ELSE FALSE END,
                updated_at = $5
          WHERE id = $1 AND user_id = $2
          RETURNING id, user_id, name, enabled, recipe, last_test_recipe_hash, last_test_report, created_at, updated_at`,
        [id, userId, recipeHash, report, now],
      );
      return sourceRow(rows[0]);
    },

    async setSourceEnabled({ id, userId, enabled, now }) {
      const rows = await client.query(
        `UPDATE custom_sources SET enabled = $3, updated_at = $4
          WHERE id = $1 AND user_id = $2
          RETURNING id, user_id, name, enabled, recipe, last_test_recipe_hash, last_test_report, created_at, updated_at`,
        [id, userId, enabled, now],
      );
      return sourceRow(rows[0]);
    },

    async deleteSource({ id, userId }) {
      const result = await client.execute('DELETE FROM custom_sources WHERE id = $1 AND user_id = $2', [id, userId]);
      return result.rowCount > 0;
    },

    async listProfiles(userId) {
      const rows = await client.query(
        `SELECT ${PROFILE_FIELDS} FROM search_profiles
          WHERE user_id = $1 ORDER BY updated_at DESC, name ASC`,
        [userId],
      );
      return rows.map(profileRow);
    },

    async listScheduledProfiles() {
      const rows = await client.query(
        `SELECT ${PROFILE_FIELDS} FROM search_profiles
          WHERE COALESCE((schedule ->> 'enabled')::boolean, FALSE) = TRUE
          ORDER BY updated_at ASC`,
      );
      return rows.map(profileRow);
    },

    async getProfile(id) {
      const rows = await client.query(
        `SELECT ${PROFILE_FIELDS} FROM search_profiles WHERE id = $1 LIMIT 1`,
        [id],
      );
      return profileRow(rows[0]);
    },

    async saveProfile(profile) {
      const rows = await client.query(
        `INSERT INTO search_profiles (
           id, user_id, name, city, region, max_price, min_bedrooms, min_bathrooms,
           enabled_sources, schedule, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12
         )
         ON CONFLICT(id) DO UPDATE SET
           name=EXCLUDED.name, city=EXCLUDED.city, region=EXCLUDED.region,
           max_price=EXCLUDED.max_price, min_bedrooms=EXCLUDED.min_bedrooms,
           min_bathrooms=EXCLUDED.min_bathrooms, enabled_sources=EXCLUDED.enabled_sources,
           schedule=EXCLUDED.schedule, updated_at=EXCLUDED.updated_at
         WHERE search_profiles.user_id = EXCLUDED.user_id
         RETURNING ${PROFILE_FIELDS}`,
        [
          profile.id, profile.userId, profile.name, profile.city, profile.region,
          profile.maxPrice, profile.minBedrooms, profile.minBathrooms,
          profile.enabledSources, profile.schedule, profile.createdAt, profile.updatedAt,
        ],
      );
      return profileRow(rows[0]);
    },

    async deleteProfile({ id, userId }) {
      const result = await client.execute('DELETE FROM search_profiles WHERE id=$1 AND user_id=$2', [id, userId]);
      return result.rowCount > 0;
    },

    async upsertListings({ profileId, sourceKind, sourceId, sourceLabel, listings, seenAt }) {
      const statements = [];
      for (const listing of listings) {
        statements.push({
          query: `INSERT INTO canonical_listings (
             id, provider_id, source_listing_id, url, title, price, currency, beds, baths,
             address, latitude, longitude, image_url, description, raw_json, first_seen, last_seen
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17
           )
           ON CONFLICT(id) DO UPDATE SET
             url=EXCLUDED.url,
             title=COALESCE(EXCLUDED.title, canonical_listings.title),
             price=COALESCE(EXCLUDED.price, canonical_listings.price),
             currency=COALESCE(EXCLUDED.currency, canonical_listings.currency),
             beds=COALESCE(EXCLUDED.beds, canonical_listings.beds),
             baths=COALESCE(EXCLUDED.baths, canonical_listings.baths),
             address=COALESCE(EXCLUDED.address, canonical_listings.address),
             latitude=COALESCE(EXCLUDED.latitude, canonical_listings.latitude),
             longitude=COALESCE(EXCLUDED.longitude, canonical_listings.longitude),
             image_url=COALESCE(EXCLUDED.image_url, canonical_listings.image_url),
             description=COALESCE(EXCLUDED.description, canonical_listings.description),
             raw_json=COALESCE(EXCLUDED.raw_json, canonical_listings.raw_json),
             first_seen=LEAST(canonical_listings.first_seen, EXCLUDED.first_seen),
             last_seen=GREATEST(canonical_listings.last_seen, EXCLUDED.last_seen)`,
          params: [
            listing.id, listing.providerId, listing.sourceListingId, listing.url, listing.title,
            listing.price, listing.currency, listing.beds, listing.baths, listing.address,
            listing.latitude, listing.longitude, listing.imageUrl, listing.description,
            listing.raw, listing.firstSeen, listing.lastSeen,
          ],
        });
        statements.push({
          query: `INSERT INTO search_profile_listing_hits (
             profile_id, listing_id, source_kind, source_id, source_label, first_seen, last_seen
           ) VALUES ($1,$2,$3,$4,$5,$6,$6)
           ON CONFLICT(profile_id,listing_id) DO UPDATE SET
             source_kind=EXCLUDED.source_kind, source_id=EXCLUDED.source_id,
             source_label=EXCLUDED.source_label,
             first_seen=LEAST(search_profile_listing_hits.first_seen, EXCLUDED.first_seen),
             last_seen=GREATEST(search_profile_listing_hits.last_seen, EXCLUDED.last_seen)`,
          params: [profileId, listing.id, sourceKind, sourceId, sourceLabel, seenAt],
        });
      }
      if (statements.length > 0) await client.transaction(statements);
      return { ingested: listings.length };
    },

    async queryFeed({ userId, profileId, sort = 'newest' }) {
      const orders = {
        newest: 'h.first_seen DESC, l.id ASC',
        'price-asc': '(l.price IS NULL) ASC, l.price ASC, h.first_seen DESC, l.id ASC',
        'price-desc': '(l.price IS NULL) ASC, l.price DESC, h.first_seen DESC, l.id ASC',
      };
      const orderBy = orders[sort];
      if (!orderBy) throw new TypeError('sort must be one of: newest, price-asc, price-desc');
      const rows = await client.query(
        `SELECT h.profile_id, h.listing_id, h.source_kind, h.source_id, h.source_label,
                h.first_seen AS hit_first_seen, h.last_seen AS hit_last_seen,
                l.provider_id, l.source_listing_id, l.url, l.title, l.price, l.currency,
                l.beds, l.baths, l.address, l.latitude, l.longitude, l.image_url, l.description, l.raw_json
           FROM search_profile_listing_hits h
           JOIN canonical_listings l ON l.id=h.listing_id
           JOIN search_profiles p ON p.id=h.profile_id
          WHERE h.profile_id=$1 AND p.user_id=$2
          ORDER BY ${orderBy}`,
        [profileId, userId],
      );
      return rows.map(feedRow);
    },

    async createRun({ id, profileId, trigger, startedAt }) {
      await client.execute(
        `INSERT INTO search_profile_runs(id,profile_id,trigger,status,started_at,finished_at)
         VALUES($1,$2,$3,'running',$4,NULL)`,
        [id, profileId, trigger, startedAt],
      );
      return this.getRun(id);
    },

    async recordRunSource(result) {
      await client.execute(
        `INSERT INTO search_profile_run_sources (
           run_id,source_kind,source_id,source_label,status,discovered_count,ingested_count,
           error_message,started_at,finished_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(run_id,source_kind,source_id) DO UPDATE SET
           source_label=EXCLUDED.source_label, status=EXCLUDED.status,
           discovered_count=EXCLUDED.discovered_count, ingested_count=EXCLUDED.ingested_count,
           error_message=EXCLUDED.error_message,
           started_at=LEAST(search_profile_run_sources.started_at,EXCLUDED.started_at),
           finished_at=GREATEST(search_profile_run_sources.finished_at,EXCLUDED.finished_at)`,
        [
          result.runId,result.sourceKind,result.sourceId,result.sourceLabel,result.status,
          result.discoveredCount,result.ingestedCount,result.errorMessage,result.startedAt,result.finishedAt,
        ],
      );
    },

    async finishRun({ id, status, finishedAt }) {
      await client.execute(
        'UPDATE search_profile_runs SET status=$2, finished_at=$3 WHERE id=$1',
        [id,status,finishedAt],
      );
      return this.getRun(id);
    },

    async getRun(id) {
      const rows = await client.query(
        'SELECT id,profile_id,trigger,status,started_at,finished_at FROM search_profile_runs WHERE id=$1 LIMIT 1',
        [id],
      );
      return runRow(client, rows[0]);
    },

    async getLatestRun(profileId) {
      const rows = await client.query(
        `SELECT id,profile_id,trigger,status,started_at,finished_at
           FROM search_profile_runs WHERE profile_id=$1
           ORDER BY started_at DESC,id DESC LIMIT 1`,
        [profileId],
      );
      return runRow(client, rows[0]);
    },
  });
};
