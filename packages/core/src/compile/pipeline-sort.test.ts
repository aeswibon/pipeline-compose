import { describe, it, expect } from 'vitest';
import { sortPipelineDocuments } from './pipeline-sort.js';
import type { Pipeline } from './parser.js';

describe('sortPipelineDocuments', () => {
  it('orders pipelines by needs', () => {
    const release: Pipeline = {
      name: 'release',
      version: 1,
      group: 'release',
      stages: [{ id: 'ci', workflow: '.github/workflows/ci.yml' }],
    };
    const deploy: Pipeline = {
      name: 'deploy',
      version: 1,
      group: 'deploy',
      needs: ['release'],
      stages: [{ id: 'gate', workflow: '.github/workflows/deploy-gate.yml' }],
    };

    expect(
      sortPipelineDocuments([deploy, release]).map((pipeline) => pipeline.name),
    ).toEqual(['release', 'deploy']);
  });

  it('rejects unknown pipeline in needs', () => {
    const deploy: Pipeline = {
      name: 'deploy',
      version: 1,
      stages: [{ id: 'gate', workflow: '.github/workflows/gate.yml' }],
      needs: ['missing'],
    };
    expect(() => sortPipelineDocuments([deploy])).toThrow(/Unknown pipeline in needs/);
  });
});
