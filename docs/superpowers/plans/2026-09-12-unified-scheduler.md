# Unified Scheduler Integration — Implementation Plan

## Goal
Make Search Profile v1 executable. Realtor.ca and enabled Custom Sources must share one execution core used by both Run Now and scheduled runs.

## Architecture
- Keep inherited Fredy job scheduler/pipeline intact during M1.
- Add ARPA Search Profile run records and per-source run records.
- One `executeProfile()` service owns:
  1. Search Profile ownership validation;
  2. run-record creation;
  3. source resolution;
  4. source discovery/extraction;
  5. canonical normalization;
  6. #16 Listing Feed ingest;
  7. per-source success/failure recording;
  8. aggregate run finalization.
- Source failures are isolated. One failed provider must not stop another source from running.
- Manual Run Now and scheduled ticks call the same execution service instance.
- Scheduler only decides which enabled Search Profiles are due.

## Run state
Run status:
- `running`
- `completed`: every attempted source completed
- `partial`: at least one completed and at least one failed
- `failed`: every attempted source failed

Per-source status:
- `completed`
- `failed`

## Scheduling
- Persisted `schedule.enabled` + `intervalMinutes` from #15 is authoritative.
- Due time is based on the latest run start time, including failed attempts, to avoid hammering broken sources.
- Scheduler tick is process-local and single-host for M1.
- Manual runs ignore schedule enabled/disabled state.

## Non-goals
- Cross-process distributed scheduler / locks.
- Retry/backoff policy beyond the next configured interval.
- Notifications for new listings (#19 / later integration).
- Provider health dashboard redesign.

## Acceptance
- Realtor.ca and Custom Source use the same execution service.
- Run Now executes a persisted Search Profile.
- Scheduled tick invokes the same execution service with trigger `scheduled`.
- A source failure is recorded with stable source kind/id/label and does not prevent other sources from completing.
- Successful canonical results ingest into #16 without duplicate profile freshness resets.
