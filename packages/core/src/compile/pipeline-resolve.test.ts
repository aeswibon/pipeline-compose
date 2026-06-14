import { describe, it, expect } from 'vitest';
import { mergePipelines, resolvePipelineDocument } from './pipeline-resolve.js';
import type { Pipeline, PipelineDocumentV2 } from './parser.js';

describe('resolvePipelineDocument', () => {
  it('inherits root group on v1 stages', () => {
    const doc = resolvePipelineDocument({
      name: 'release',
      version: 1,
      group: 'release',
      stages: [
        { id: 'ci', workflow: '.github/workflows/ci.yml' },
        {
          id: 'sync',
          workflow: '.github/workflows/stage-version-sync.yml',
          needs: ['ci'],
        },
      ],
    });

    expect(doc.stages.map((stage) => stage.resolvedGroup)).toEqual([
      'release',
      'release',
    ]);
  });

  it('flattens v2 pipelines in needs order', () => {
    const doc: PipelineDocumentV2 = {
      version: 2,
      pipelines: {
        deploy: {
          group: 'deploy',
          needs: ['release'],
          stages: [{ id: 'gate', workflow: '.github/workflows/deploy-gate.yml' }],
        },
        release: {
          group: 'release',
          stages: [
            { id: 'ci', workflow: '.github/workflows/ci.yml' },
            {
              id: 'sync',
              workflow: '.github/workflows/stage-version-sync.yml',
              needs: ['ci'],
            },
          ],
        },
      },
    };

    const resolved = resolvePipelineDocument(doc);
    expect(resolved.stages.map((stage) => stage.id)).toEqual(['ci', 'sync', 'gate']);
    expect(resolved.name).toBe('combined');
  });

  it('rejects duplicate stage ids across v2 pipelines', () => {
    const doc: PipelineDocumentV2 = {
      version: 2,
      pipelines: {
        release: {
          stages: [{ id: 'ci', workflow: '.github/workflows/ci.yml' }],
        },
        deploy: {
          needs: ['release'],
          stages: [{ id: 'ci', workflow: '.github/workflows/other.yml' }],
        },
      },
    };

    expect(() => resolvePipelineDocument(doc)).toThrow(/Duplicate stage id/);
  });
});

describe('mergePipelines', () => {
  it('concatenates multi-file pipelines by pipeline needs', () => {
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
      stages: [{ id: 'gate', workflow: '.github/workflows/gate.yml' }],
    };

    const merged = mergePipelines([deploy, release]);
    expect(merged.stages.map((stage) => stage.id)).toEqual(['ci', 'gate']);
  });
});
