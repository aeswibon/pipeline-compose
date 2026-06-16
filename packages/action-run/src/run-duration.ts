export type RunTiming = {
  run_started_at?: string | null;
  updated_at?: string | null;
};

export function runDurationSeconds(run: RunTiming): number | undefined {
  if (!run.run_started_at || !run.updated_at) {
    return undefined;
  }
  const start = Date.parse(run.run_started_at);
  const end = Date.parse(run.updated_at);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return undefined;
  }
  return Math.round((end - start) / 1000);
}

export function formatSavedDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `~${totalSeconds} second(s)`;
  }
  const minutes = Math.round(totalSeconds / 60);
  return `~${Math.max(1, minutes)} minute(s)`;
}
