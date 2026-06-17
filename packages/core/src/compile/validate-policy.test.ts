import { describe, expect, it } from 'vitest';
import { applyValidatePolicy, parseValidatePolicy } from './validate-policy.js';
import type { ValidationIssue } from './validate-report.js';

describe('parseValidatePolicy', () => {
  it('accepts allow and deny lists', () => {
    expect(parseValidatePolicy({ allow: ['stage.cross-repo'], deny: ['workflow.missing'] })).toEqual({
      allow: ['stage.cross-repo'],
      deny: ['workflow.missing'],
    });
  });

  it('rejects empty policy', () => {
    expect(() => parseValidatePolicy({})).toThrow(/allow and\/or deny/);
  });
});

describe('applyValidatePolicy', () => {
  const issues: ValidationIssue[] = [
    { level: 'warn', code: 'stage.cross-repo', message: 'cross-repo' },
    { level: 'warn', code: 'workflow.orphan', message: 'orphan' },
    { level: 'error', code: 'needs.unknown', message: 'unknown' },
  ];

  it('filters allow-listed codes', () => {
    const filtered = applyValidatePolicy(issues, { allow: ['stage.cross-repo'] });
    expect(filtered.map((i) => i.code)).toEqual(['workflow.orphan', 'needs.unknown']);
  });

  it('promotes deny-listed warnings to errors', () => {
    const filtered = applyValidatePolicy(issues, { deny: ['workflow.orphan'] });
    expect(filtered.find((i) => i.code === 'workflow.orphan')?.level).toBe('error');
  });
});
