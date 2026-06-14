import { describe, it, expect } from 'vitest';
import { matchesDispatchedRun, stripRefPrefix } from './github.js';
import type { WorkflowRun } from './github.js';

describe('stripRefPrefix', () => {
  it('strips refs/heads and refs/tags', () => {
    expect(stripRefPrefix('refs/heads/master')).toBe('master');
    expect(stripRefPrefix('refs/tags/v1.0.0')).toBe('v1.0.0');
  });
});

describe('matchesDispatchedRun', () => {
  const baseRun: WorkflowRun = {
    id: 1,
    status: 'completed',
    conclusion: 'success',
    created_at: new Date('2026-06-14T12:00:00Z').toISOString(),
    head_branch: 'master',
  };

  it('matches branch dispatches by head_branch', () => {
    expect(
      matchesDispatchedRun(
        baseRun,
        'refs/heads/master',
        Date.parse('2026-06-14T11:59:50Z'),
      ),
    ).toBe(true);
  });

  it('matches tag dispatches when head_branch is null', () => {
    expect(
      matchesDispatchedRun(
        { ...baseRun, head_branch: null },
        'refs/tags/v1.0.0',
        Date.parse('2026-06-14T11:59:50Z'),
      ),
    ).toBe(true);
  });

  it('rejects runs created before dispatch window', () => {
    expect(
      matchesDispatchedRun(
        baseRun,
        'refs/heads/master',
        Date.parse('2026-06-14T12:00:10Z'),
      ),
    ).toBe(false);
  });
});
