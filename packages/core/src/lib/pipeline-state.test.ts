import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import {
  savePipelineState,
  loadPipelineState,
  listPipelineStates,
  formatPipelineState,
  STATE_DIR,
} from './pipeline-state.js';
import type { PipelineStateRecord } from './pipeline-state.js';

function makeRecord(overrides?: Partial<PipelineStateRecord>): PipelineStateRecord {
  return {
    version: 1,
    pipelineName: 'release',
    runId: 'run-001',
    startedAt: '2026-06-17T12:00:00Z',
    completedAt: '2026-06-17T12:05:00Z',
    stages: [
      { id: 'ci', status: 'success', outputs: { tag: 'v1' }, workflow: 'ci.yml', startedAt: '2026-06-17T12:00:00Z', completedAt: '2026-06-17T12:03:00Z', durationMs: 180000 },
      { id: 'deploy', status: 'success', outputs: {}, workflow: 'deploy.yml', startedAt: '2026-06-17T12:03:00Z', completedAt: '2026-06-17T12:05:00Z', durationMs: 120000 },
    ],
    success: true,
    ...overrides,
  };
}

describe('pipeline state', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(tmpdir(), 'pipeline-state-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves and loads state', () => {
    const record = makeRecord();
    const savedPath = savePipelineState(tmpDir, record);
    expect(fs.existsSync(savedPath)).toBe(true);
    expect(savedPath).toContain(STATE_DIR);
    expect(savedPath).toContain('release-run-001');

    const loaded = loadPipelineState(tmpDir, 'release', 'run-001');
    expect(loaded).not.toBeNull();
    expect(loaded!.pipelineName).toBe('release');
    expect(loaded!.stages).toHaveLength(2);
    expect(loaded!.stages[0].outputs).toEqual({ tag: 'v1' });
  });

  it('returns null for missing state', () => {
    const loaded = loadPipelineState(tmpDir, 'nonexistent', 'nope');
    expect(loaded).toBeNull();
  });

  it('lists states sorted by startedAt descending', () => {
    savePipelineState(tmpDir, makeRecord({ runId: 'run-001', startedAt: '2026-06-17T10:00:00Z' }));
    savePipelineState(tmpDir, makeRecord({ runId: 'run-002', startedAt: '2026-06-17T12:00:00Z' }));

    const records = listPipelineStates(tmpDir);
    expect(records).toHaveLength(2);
    expect(records[0].runId).toBe('run-002');
    expect(records[1].runId).toBe('run-001');
  });

  it('filters by pipeline name', () => {
    savePipelineState(tmpDir, makeRecord({ pipelineName: 'release', runId: 'r1' }));
    savePipelineState(tmpDir, makeRecord({ pipelineName: 'nightly', runId: 'r2' }));

    const records = listPipelineStates(tmpDir, 'release');
    expect(records).toHaveLength(1);
    expect(records[0].runId).toBe('r1');
  });

  it('formats output for display', () => {
    const record = makeRecord({
      stages: [
        { id: 'ci', status: 'success', outputs: { tag: 'v1' }, workflow: 'ci.yml', repo: 'owner/repo', startedAt: '', completedAt: '', durationMs: 5230 },
        { id: 'test', status: 'failure', outputs: {}, workflow: 'test.yml', startedAt: '', completedAt: '', durationMs: 1500 },
        { id: 'deploy', status: 'skipped', outputs: {}, workflow: 'deploy.yml', startedAt: '', completedAt: '', durationMs: 0 },
      ],
      success: false,
    });
    const text = formatPipelineState(record);
    expect(text).toContain('release');
    expect(text).toContain('FAIL');
    expect(text).toContain('owner/repo');
    expect(text).toContain('tag');
  });
});
