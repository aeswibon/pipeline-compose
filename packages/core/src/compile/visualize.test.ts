import { describe, it, expect } from 'vitest';
import { renderPipelineHtml, buildVisualizeState } from './visualize.js';
import type { ResolvedPipeline, ResolvedStage } from './parser.js';

function mkStage(overrides: Partial<ResolvedStage> & { id: string }): ResolvedStage {
  return {
    workflow: 'test.yml',
    repo: undefined,
    needs: undefined,
    run: undefined,
    ...overrides,
  };
}

describe('renderPipelineHtml', () => {
  it('renders a simple pipeline as mermaid', () => {
    const pipeline: ResolvedPipeline = {
      name: 'Test',
      stages: [
        mkStage({ id: 'a' }),
        mkStage({ id: 'b', needs: ['a'] }),
      ],
    };

    const html = renderPipelineHtml(pipeline);
    expect(html).toContain('Test');
    expect(html).toContain('mermaid');
    expect(html).toContain('flowchart LR');
    expect(html).toContain('a --&gt; b');
    expect(html).toContain('mermaid@11');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('renders with state colors', () => {
    const pipeline: ResolvedPipeline = {
      name: 'StateTest',
      stages: [
        mkStage({ id: 'pass' }),
        mkStage({ id: 'fail' }),
      ],
    };

    const html = renderPipelineHtml(pipeline, {
      state: { pass: { status: 'success' }, fail: { status: 'failure' } },
    });

    expect(html).toContain('classDef success');
    expect(html).toContain('classDef failure');
    expect(html).toContain('class pass success');
    expect(html).toContain('class fail failure');
  });

  it('summarizes state counts', () => {
    const pipeline: ResolvedPipeline = {
      name: 'Counts',
      stages: [
        mkStage({ id: 'a' }),
        mkStage({ id: 'b' }),
        mkStage({ id: 'c' }),
        mkStage({ id: 'd' }),
      ],
    };

    const html = renderPipelineHtml(pipeline, {
      state: { a: { status: 'success' }, b: { status: 'failure' }, c: { status: 'skipped' }, d: { status: 'running' } },
    });

    expect(html).toContain('success');
    expect(html).toContain('failed');
    expect(html).toContain('skipped');
    expect(html).toContain('running');
    expect(html).toContain('4 stages · 1 success · 1 failed · 1 skipped · 1 running');
  });
});

describe('buildVisualizeState', () => {
  it('returns empty for no records', () => {
    const pipeline: ResolvedPipeline = { name: 't', stages: [mkStage({ id: 'a' })] };
    expect(buildVisualizeState(pipeline)).toEqual({});
    expect(buildVisualizeState(pipeline, [])).toEqual({});
  });

  it('extracts state from first record', () => {
    const pipeline: ResolvedPipeline = { name: 't', stages: [mkStage({ id: 'a' }), mkStage({ id: 'b' })] };
    const records = [
      { version: 1 as const, pipelineName: 't', runId: 'r1', success: false, startedAt: '', stages: [{ id: 'a', status: 'success' as const, outputs: {}, workflow: '', durationMs: 1000, startedAt: '', completedAt: '' }, { id: 'b', status: 'failure' as const, outputs: {}, workflow: '', durationMs: 0, startedAt: '', completedAt: '' }] },
    ];
    const state = buildVisualizeState(pipeline, records);
    expect(state['a']).toEqual({ status: 'success', durationMs: 1000 });
    expect(state['b']).toEqual({ status: 'failure', durationMs: 0 });
  });

  it('filters by runId when specified', () => {
    const pipeline: ResolvedPipeline = { name: 't', stages: [mkStage({ id: 'a' })] };
    const records = [
      { version: 1 as const, pipelineName: 't', runId: 'r1', success: true, startedAt: '', stages: [{ id: 'a', status: 'success' as const, outputs: {}, workflow: '', durationMs: 0, startedAt: '', completedAt: '' }] },
      { version: 1 as const, pipelineName: 't', runId: 'r2', success: false, startedAt: '', stages: [{ id: 'a', status: 'failure' as const, outputs: {}, workflow: '', durationMs: 0, startedAt: '', completedAt: '' }] },
    ];
    const state = buildVisualizeState(pipeline, records, 'r2');
    expect(state['a']).toEqual({ status: 'failure', durationMs: 0 });
  });
});
