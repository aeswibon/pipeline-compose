import { describe, expect, it } from 'vitest';
import { formatSavedDuration, runDurationSeconds } from './run-duration.js';

describe('runDurationSeconds', () => {
  it('computes elapsed seconds from run timestamps', () => {
    expect(
      runDurationSeconds({
        run_started_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:05:30Z',
      }),
    ).toBe(330);
  });

  it('returns undefined for invalid timestamps', () => {
    expect(runDurationSeconds({})).toBeUndefined();
  });
});

describe('formatSavedDuration', () => {
  it('formats sub-minute durations in seconds', () => {
    expect(formatSavedDuration(45)).toBe('~45 second(s)');
  });

  it('formats longer durations in minutes', () => {
    expect(formatSavedDuration(330)).toBe('~6 minute(s)');
  });
});
