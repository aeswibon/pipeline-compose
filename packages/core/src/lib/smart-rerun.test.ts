import { describe, expect, it } from 'vitest';
import { canReuseStage, parseRerunState, stageFingerprint } from './smart-rerun.js';

describe('stageFingerprint', () => {
  const stage = {
    id: 'build',
    workflow: '.github/workflows/build.yml',
  };

  it('is stable for the same inputs', () => {
    const a = stageFingerprint(stage, { phase: 'unit' }, 'refs/tags/v1.0.0');
    const b = stageFingerprint(stage, { phase: 'unit' }, 'refs/tags/v1.0.0');
    expect(a).toBe(b);
  });

  it('changes when inputs change', () => {
    const a = stageFingerprint(stage, { phase: 'unit' }, 'refs/tags/v1.0.0');
    const b = stageFingerprint(stage, { phase: 'e2e' }, 'refs/tags/v1.0.0');
    expect(a).not.toBe(b);
  });
});

describe('canReuseStage', () => {
  it('requires matching fingerprint and declared outputs', () => {
    const previous = {
      fingerprint: 'abc',
      outputs: { version: '1.0.0' },
      runId: 1,
    };
    expect(canReuseStage(previous, 'abc', ['version'])).toBe(true);
    expect(canReuseStage(previous, 'def', ['version'])).toBe(false);
    expect(canReuseStage(previous, 'abc', ['version', 'skip'])).toBe(false);
  });
});

describe('parseRerunState', () => {
  it('parses valid state', () => {
    const state = parseRerunState(
      JSON.stringify({ version: 1, stages: { ci: { fingerprint: 'x', outputs: {}, runId: 1 } } }),
    );
    expect(state?.stages.ci?.runId).toBe(1);
  });

  it('rejects invalid payloads', () => {
    expect(parseRerunState('not-json')).toBeNull();
    expect(parseRerunState(JSON.stringify({ version: 2 }))).toBeNull();
  });
});
