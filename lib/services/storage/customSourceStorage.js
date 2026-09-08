import SqliteConnection from './SqliteConnection.js';

const toJson = (value) => (value == null ? null : JSON.stringify(value));
const fromJson = (value, fallback) => {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const mapRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    enabled: Boolean(row.enabled),
    recipe: fromJson(row.recipe_json, {}),
    draftHash: row.draft_hash,
    lastTestRecipeHash: row.last_test_recipe_hash ?? null,
    lastTestStatus: row.last_test_status ?? null,
    lastTestReport: fromJson(row.last_test_report_json, null),
    lastTestedAt: row.last_tested_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const selectFields = `
  id,
  user_id,
  name,
  enabled,
  recipe_json,
  draft_hash,
  last_test_recipe_hash,
  last_test_status,
  last_test_report_json,
  last_tested_at,
  created_at,
  updated_at
`;

export const getById = (id) => {
  const row = SqliteConnection.query(
    `SELECT ${selectFields} FROM custom_sources WHERE id = @id LIMIT 1`,
    { id },
  )[0];
  return mapRow(row);
};

export const listByUser = (userId) =>
  SqliteConnection.query(
    `SELECT ${selectFields}
       FROM custom_sources
      WHERE user_id = @userId
      ORDER BY name COLLATE NOCASE, created_at`,
    { userId },
  ).map(mapRow);

export const upsert = (source) => {
  SqliteConnection.execute(
    `INSERT INTO custom_sources (
       id, user_id, name, enabled, recipe_json, draft_hash,
       last_test_recipe_hash, last_test_status, last_test_report_json, last_tested_at,
       created_at, updated_at
     ) VALUES (
       @id, @userId, @name, @enabled, @recipeJson, @draftHash,
       @lastTestRecipeHash, @lastTestStatus, @lastTestReportJson, @lastTestedAt,
       @createdAt, @updatedAt
     )
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       name = excluded.name,
       enabled = excluded.enabled,
       recipe_json = excluded.recipe_json,
       draft_hash = excluded.draft_hash,
       last_test_recipe_hash = excluded.last_test_recipe_hash,
       last_test_status = excluded.last_test_status,
       last_test_report_json = excluded.last_test_report_json,
       last_tested_at = excluded.last_tested_at,
       updated_at = excluded.updated_at`,
    {
      id: source.id,
      userId: source.userId,
      name: source.name,
      enabled: source.enabled ? 1 : 0,
      recipeJson: toJson(source.recipe),
      draftHash: source.draftHash,
      lastTestRecipeHash: source.lastTestRecipeHash ?? null,
      lastTestStatus: source.lastTestStatus ?? null,
      lastTestReportJson: toJson(source.lastTestReport),
      lastTestedAt: source.lastTestedAt ?? null,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    },
  );
  return getById(source.id);
};

export const recordTest = ({
  id,
  lastTestRecipeHash,
  lastTestStatus,
  lastTestReport,
  lastTestedAt,
  updatedAt,
}) => {
  SqliteConnection.execute(
    `UPDATE custom_sources
        SET last_test_recipe_hash = @lastTestRecipeHash,
            last_test_status = @lastTestStatus,
            last_test_report_json = @lastTestReportJson,
            last_tested_at = @lastTestedAt,
            updated_at = @updatedAt
      WHERE id = @id`,
    {
      id,
      lastTestRecipeHash,
      lastTestStatus,
      lastTestReportJson: toJson(lastTestReport),
      lastTestedAt,
      updatedAt,
    },
  );
  return getById(id);
};

export const setEnabled = ({ id, enabled, updatedAt }) => {
  SqliteConnection.execute(
    `UPDATE custom_sources SET enabled = @enabled, updated_at = @updatedAt WHERE id = @id`,
    { id, enabled: enabled ? 1 : 0, updatedAt },
  );
  return getById(id);
};

export const remove = (id) => {
  SqliteConnection.execute('DELETE FROM custom_sources WHERE id = @id', { id });
};
