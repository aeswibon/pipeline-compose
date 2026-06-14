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

  it('formats human-readable output', () => {
    const text = formatSimulateReport([
      { id: 'ci', status: 'run', workflow: '.github/workflows/ci.yml' },
    ]);
    expect(text).toContain('Simulation');
    expect(text).toContain('run     ci');
  });
});
