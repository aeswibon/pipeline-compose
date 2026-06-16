import { describe, it, expect } from 'vitest';
import { simulatePipeline, formatSimulateReport } from './simulate.js';
import type { ResolvedPipeline } from './parser.js';

describe('simulatePipeline', () => {
  it('skips stages when when expression is false', () => {
    const pipeline: ResolvedPipeline = {
      name: 'release',
      version: 2,
      schemaVersion: 2,
      stages: [
        { id: 'ci', workflow: '.github/workflows/ci.yml' },
        {
          id: 'deploy',
          workflow: '.github/workflows/deploy.yml',
          needs: ['ci'],
          when: "startsWith(github.ref, 'refs/tags/v')",
        },
      ],
    };

    const results = simulatePipeline(pipeline, {
      github: { ref: 'refs/heads/master' },
    });

    expect(results).toEqual([
      expect.objectContaining({ id: 'ci', status: 'run' }),
      expect.objectContaining({ id: 'deploy', status: 'skip' }),
    ]);
  });

  it('blocks downstream when upstream is skipped', () => {
    const pipeline: ResolvedPipeline = {
      name: 'release',
      version: 2,
      schemaVersion: 2,
      stages: [
        {
          id: 'gate',
          workflow: '.github/workflows/gate.yml',
          when: 'false',
        },
        {
          id: 'deploy',
          workflow: '.github/workflows/deploy.yml',
          needs: ['gate'],
        },
      ],
    };

    const results = simulatePipeline(pipeline, { github: { ref: 'refs/heads/master' } });
    expect(results[1]).toMatchObject({ id: 'deploy', status: 'blocked' });
  });

  it('formats human-readable output with wave grouping', () => {
    const text = formatSimulateReport([
      { id: 'ci', status: 'run', workflow: '.github/workflows/ci.yml', wave: 1 },
      { id: 'lint', status: 'run', workflow: '.github/workflows/lint.yml', wave: 2 },
      { id: 'test', status: 'run', workflow: '.github/workflows/test.yml', wave: 2 },
    ]);
    expect(text).toContain('Simulation');
    expect(text).toContain('Wave 1');
    expect(text).toContain('Wave 2');
    expect(text).toContain('run     ci');
    expect(text).toContain('lint');
    expect(text).toContain('test');
  });

  it('assigns parallel siblings to the same wave', () => {
    const pipeline: ResolvedPipeline = {
      name: 'release',
      version: 2,
      schemaVersion: 2,
      stages: [
        { id: 'ci', workflow: '.github/workflows/ci.yml' },
        { id: 'lint', workflow: '.github/workflows/lint.yml', needs: ['ci'] },
        { id: 'test', workflow: '.github/workflows/test.yml', needs: ['ci'] },
      ],
    };

    const results = simulatePipeline(pipeline, { github: { ref: 'refs/heads/master' } });
    expect(results.map((r) => [r.id, r.wave])).toEqual([
      ['ci', 1],
      ['lint', 2],
      ['test', 2],
    ]);
  });
});
