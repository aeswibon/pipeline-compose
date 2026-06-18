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
  it('renders a simple pipeline as SVG DAG', () => {
    const pipeline: ResolvedPipeline = {
      name: 'Test',
      stages: [
        mkStage({ id: 'a' }),
        mkStage({ id: 'b', needs: ['a'] }),
      ],
    };

    const html = renderPipelineHtml(pipeline);
    expect(html).toContain('Test');
    expect(html).toContain('<svg');
    expect(html).toContain('stroke="#d0d7de"');
    expect(html).toContain('>a</text>');
    expect(html).toContain('>b</text>');
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

    expect(html).toContain('#2da44e');
    expect(html).toContain('#cf222e');
    expect(html).toContain('d="M4 8l3 3 5-5"');
    expect(html).toContain('d="M4 4l8 8M12 4l-8 8"');
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

    expect(html).toContain('1 success');
    expect(html).toContain('1 failed');
    expect(html).toContain('1 skipped');
    expect(html).toContain('1 running');
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
