import { describe, expect, it } from 'vitest';
import {
  parseCommitStatusMode,
  resolveCommitStatusSha,
  shouldReportCommitStatus,
} from './commit-status.js';

describe('commit status helpers', () => {
  it('parses commit_status mode', () => {
    expect(parseCommitStatusMode('auto')).toBe('auto');
    expect(parseCommitStatusMode('TRUE')).toBe('true');
    expect(() => parseCommitStatusMode('yes')).toThrow(/auto, true, or false/);
  });

  it('auto reports only on pull_request', () => {
    expect(shouldReportCommitStatus('auto', 'pull_request')).toBe(true);
    expect(shouldReportCommitStatus('auto', 'push')).toBe(false);
    expect(shouldReportCommitStatus('true', 'push')).toBe(true);
    expect(shouldReportCommitStatus('false', 'pull_request')).toBe(false);
  });

  it('resolves sha from PR head, explicit override, then env', () => {
    expect(
      resolveCommitStatusSha(
        { pull_request: { head: { sha: 'pr-sha' } } },
        { envSha: 'env-sha' },
      ),
    ).toBe('pr-sha');
    expect(resolveCommitStatusSha({}, { explicitSha: 'override' })).toBe('override');
    expect(resolveCommitStatusSha({}, { envSha: 'env-sha' })).toBe('env-sha');
    expect(resolveCommitStatusSha({}, {})).toBeNull();
  });
});
