import { describe, expect, it } from 'vitest';
import { globalLockPath, parseGlobalLockRecord, serializeGlobalLockRecord } from './global-lock.js';

describe('global lock', () => {
  it('builds lock file path from group', () => {
    expect(globalLockPath('staging-${{ github.ref }}')).toContain('staging');
    expect(globalLockPath('staging-${{ github.ref }}')).toMatch(/\.json$/);
  });

  it('round-trips lock record', () => {
    const record = {
      version: 1 as const,
      group: 'staging',
      holder: { owner: 'o', repo: 'r', workflow_run_id: 9 },
      acquired_at: '2026-06-16T00:00:00.000Z',
    };
    const parsed = parseGlobalLockRecord(serializeGlobalLockRecord(record));
    expect(parsed).toEqual(record);
  });
});
