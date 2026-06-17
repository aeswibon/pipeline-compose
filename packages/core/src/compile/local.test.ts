import { describe, it, expect } from 'vitest';
import { formatLocalRunResult } from './local.js';
import type { LocalRunResult } from './local.js';

describe('formatLocalRunResult', () => {
  it('formats all-pass result', () => {
    const result: LocalRunResult = {
      success: true,
      stages: [
        { id: 'ci', workflow: '.github/workflows/ci.yml', status: 'success', outputs: { tag: 'v1' }, durationMs: 5230, repo: undefined },
        { id: 'deploy', workflow: '.github/workflows/deploy.yml', status: 'success', outputs: {}, durationMs: 12400, repo: undefined },
      ],
    };
    const text = formatLocalRunResult(result);
    expect(text).toContain('ci');
    expect(text).toContain('deploy');
    expect(text).toContain('PASS');
    expect(text).toContain('2 passed');
    expect(text).toContain('5s');
    expect(text).toContain('12s');
    expect(text).toContain('tag');
  });

  it('formats mixed result with failures', () => {
    const result: LocalRunResult = {
      success: false,
      stages: [
        { id: 'ci', workflow: '.github/workflows/ci.yml', status: 'success', outputs: {}, durationMs: 3000, repo: undefined },
        { id: 'test', workflow: '.github/workflows/test.yml', status: 'failure', outputs: {}, durationMs: 1500, repo: undefined },
        { id: 'deploy', workflow: '.github/workflows/deploy.yml', status: 'skipped', outputs: {}, durationMs: 0, repo: undefined },
      ],
    };
    const text = formatLocalRunResult(result);
    expect(text).toContain('FAIL');
    expect(text).toContain('1 passed');
    expect(text).toContain('1 failed');
    expect(text).toContain('1 skipped');
  });

  it('includes cross-repo info when present', () => {
    const result: LocalRunResult = {
      success: true,
      stages: [
        { id: 'ci', workflow: '.github/workflows/ci.yml', status: 'success', outputs: {}, durationMs: 1000, repo: 'owner/qa-repo' },
      ],
    };
    const text = formatLocalRunResult(result);
    expect(text).toContain('owner/qa-repo');
  });

  it('formats durations over a minute', () => {
    const result: LocalRunResult = {
      success: true,
      stages: [
        { id: 'long', workflow: 'w.yml', status: 'success', outputs: {}, durationMs: 125000, repo: undefined },
      ],
    };
    const text = formatLocalRunResult(result);
    expect(text).toContain('2m 5s');
  });

  it('formats shell run stages with action label', () => {
    const result: LocalRunResult = {
      success: true,
      stages: [
        { id: 'build', workflow: 'echo hello && echo "{\\"tag\\":\\"v1\\"}" > $PIPELINE_COMPOSE_OUTPUTS', status: 'success', outputs: { tag: 'v1' }, durationMs: 500, repo: undefined },
      ],
    };
    const text = formatLocalRunResult(result);
    expect(text).toContain('action:');
    expect(text).toContain('echo hello');
  });
});
