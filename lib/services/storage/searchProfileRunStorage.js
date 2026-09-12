import SqliteConnection from './SqliteConnection.js';

const mapSourceRow = (row) => ({
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

const sourceRows = (runId) =>
  SqliteConnection.query(
    `SELECT
       run_id, source_kind, source_id, source_label, status,
       discovered_count, ingested_count, error_message, started_at, finished_at
     FROM search_profile_run_sources
     WHERE run_id = @runId
     ORDER BY started_at ASC, source_kind ASC, source_id ASC`,
    { runId },
  ).map(mapSourceRow);

const mapRunRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    profileId: row.profile_id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    sources: sourceRows(row.id),
  };
};

export const createRun = ({ id, profileId, trigger, startedAt }) => {
  SqliteConnection.execute(
    `INSERT INTO search_profile_runs (
       id, profile_id, trigger, status, started_at, finished_at
     ) VALUES (
       @id, @profileId, @trigger, 'running', @startedAt, NULL
     )`,
    { id, profileId, trigger, startedAt },
  );
  return getRun(id);
};

export const recordSourceResult = ({
  runId,
  sourceKind,
  sourceId,
  sourceLabel,
  status,
  discoveredCount = 0,
  ingestedCount = 0,
  errorMessage = null,
  startedAt,
  finishedAt,
}) => {
  SqliteConnection.execute(
    `INSERT INTO search_profile_run_sources (
       run_id, source_kind, source_id, source_label, status,
       discovered_count, ingested_count, error_message, started_at, finished_at
     ) VALUES (
       @runId, @sourceKind, @sourceId, @sourceLabel, @status,
       @discoveredCount, @ingestedCount, @errorMessage, @startedAt, @finishedAt
     )
     ON CONFLICT(run_id, source_kind, source_id) DO UPDATE SET
       source_label = excluded.source_label,
       status = excluded.status,
       discovered_count = excluded.discovered_count,
       ingested_count = excluded.ingested_count,
       error_message = excluded.error_message,
       started_at = MIN(search_profile_run_sources.started_at, excluded.started_at),
       finished_at = MAX(search_profile_run_sources.finished_at, excluded.finished_at)`,
    {
      runId,
      sourceKind,
      sourceId,
      sourceLabel,
      status,
      discoveredCount,
      ingestedCount,
      errorMessage,
      startedAt,
      finishedAt,
    },
  );

  const row = SqliteConnection.query(
    `SELECT
       run_id, source_kind, source_id, source_label, status,
       discovered_count, ingested_count, error_message, started_at, finished_at
     FROM search_profile_run_sources
     WHERE run_id = @runId AND source_kind = @sourceKind AND source_id = @sourceId
     LIMIT 1`,
    { runId, sourceKind, sourceId },
  )[0];
  return row ? mapSourceRow(row) : null;
};

export const finishRun = ({ id, status, finishedAt }) => {
  SqliteConnection.execute(
    `UPDATE search_profile_runs
        SET status = @status,
            finished_at = @finishedAt
      WHERE id = @id`,
    { id, status, finishedAt },
  );
  return getRun(id);
};

export const getRun = (id) => {
  const row = SqliteConnection.query(
    `SELECT id, profile_id, trigger, status, started_at, finished_at
       FROM search_profile_runs
      WHERE id = @id
      LIMIT 1`,
    { id },
  )[0];
  return mapRunRow(row);
};

export const getLatestRun = (profileId) => {
  const row = SqliteConnection.query(
    `SELECT id, profile_id, trigger, status, started_at, finished_at
       FROM search_profile_runs
      WHERE profile_id = @profileId
      ORDER BY started_at DESC, id DESC
      LIMIT 1`,
    { profileId },
  )[0];
  return mapRunRow(row);
};
