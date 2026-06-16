export const GLOBAL_LOCK_DIR = '.pipeline-compose/locks';

export type GlobalLockHolder = {
  owner: string;
  repo: string;
  workflow_run_id: number;
};

export type GlobalLockRecord = {
  version: 1;
  group: string;
  holder: GlobalLockHolder;
  acquired_at: string;
};

export function globalLockPath(group: string): string {
  const safe = group.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return `${GLOBAL_LOCK_DIR}/${safe}.json`;
}

export function parseGlobalLockRecord(raw: string): GlobalLockRecord | null {
  try {
    const parsed = JSON.parse(raw) as GlobalLockRecord;
    if (
      parsed?.version !== 1 ||
      !parsed.holder?.owner ||
      !parsed.holder?.repo ||
      !parsed.holder?.workflow_run_id
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function serializeGlobalLockRecord(record: GlobalLockRecord): string {
  return JSON.stringify(record);
}
