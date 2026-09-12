const errorMessage = (error) => {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
};

const intervalMs = (profile) => {
  const minutes = profile?.schedule?.intervalMinutes;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return null;
  return minutes * 60 * 1000;
};

export const isSearchProfileDue = ({ profile, latestRun, now = Date.now() } = {}) => {
  if (profile?.schedule?.enabled !== true) return false;
  const interval = intervalMs(profile);
  if (interval == null || !Number.isFinite(now)) return false;
  if (!latestRun || !Number.isFinite(latestRun.startedAt)) return true;
  return now - latestRun.startedAt >= interval;
};

export const createSearchProfileScheduler = ({
  searchProfileStorage,
  runStorage,
  executionService,
  now = Date.now,
} = {}) => {
  if (searchProfileStorage == null || typeof searchProfileStorage.listScheduled !== 'function') {
    throw new TypeError('searchProfileStorage must expose listScheduled()');
  }
  if (runStorage == null || typeof runStorage.getLatestRun !== 'function') {
    throw new TypeError('runStorage must expose getLatestRun(profileId)');
  }
  if (executionService == null || typeof executionService.execute !== 'function') {
    throw new TypeError('executionService must expose execute()');
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  return Object.freeze({
    async tick() {
      const profiles = searchProfileStorage.listScheduled();
      const currentTime = now();
      const dueProfiles = profiles.filter((profile) =>
        isSearchProfileDue({
          profile,
          latestRun: runStorage.getLatestRun(profile.id),
          now: currentTime,
        }),
      );

      const runs = [];
      let completed = 0;
      let failed = 0;

      for (const profile of dueProfiles) {
        try {
          const run = await executionService.execute({
            userId: profile.userId,
            profileId: profile.id,
            trigger: 'scheduled',
          });
          completed += 1;
          runs.push({
            profileId: profile.id,
            runId: run?.id ?? null,
            status: run?.status ?? 'completed',
          });
        } catch (error) {
          failed += 1;
          runs.push({
            profileId: profile.id,
            runId: null,
            status: 'failed',
            error: errorMessage(error),
          });
        }
      }

      return {
        checked: profiles.length,
        due: dueProfiles.length,
        completed,
        failed,
        runs,
      };
    },
  });
};
