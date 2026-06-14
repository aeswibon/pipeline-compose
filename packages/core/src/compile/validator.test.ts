import { describe, it, expect } from 'vitest';
import {
  validatePipeline,
  validatePipelineDocument,
  validatePipelineDocuments,
} from './validator.js';
import type { Pipeline, PipelineDocument } from './parser.js';

const validPipeline: Pipeline = {
  name: 'release',
  version: 1,
  stages: [
    { id: 'ci', workflow: '.github/workflows/ci.yml' },
    {
      id: 'publish',
      workflow: '.github/workflows/publish.yml',
      needs: ['ci'],
    },
  ],
};

describe('validatePipeline', () => {
  it('accepts a valid pipeline and sorts stages by needs', () => {
    const shuffled: Pipeline = {
      ...validPipeline,
      stages: [...validPipeline.stages].reverse(),
    };
    const result = validatePipeline(shuffled);
    expect(result.stages.map((s) => s.id)).toEqual(['ci', 'publish']);
  });

  it('rejects schema violations', () => {
    const invalid = {
      ...validPipeline,
      name: 'Invalid Name',
    } as Pipeline;
    expect(() => validatePipeline(invalid)).toThrow(/Invalid pipeline/);
  });

  it('rejects duplicate stage ids', () => {
    const duplicate: Pipeline = {
      name: 'release',
      version: 1,
      stages: [
        { id: 'ci', workflow: '.github/workflows/ci.yml' },
        { id: 'ci', workflow: '.github/workflows/other.yml' },
      ],
    };
    expect(() => validatePipeline(duplicate)).toThrow(/Duplicate stage id: ci/);
  });

  it('rejects empty stages array', () => {
    const empty: Pipeline = {
      name: 'release',
      version: 1,
      stages: [],
    };
    expect(() => validatePipeline(empty)).toThrow(/Invalid pipeline/);
  });

  it('validates v2 pipeline documents', () => {
    const doc: PipelineDocument = {
      version: 2,
      pipelines: {
        release: {
          group: 'release',
          stages: [{ id: 'ci', workflow: '.github/workflows/ci.yml' }],
        },
      },
    };
    const resolved = validatePipelineDocument(doc);
    expect(resolved.stages.map((stage) => stage.id)).toEqual(['ci']);
    expect(resolved.stages[0].resolvedGroup).toBe('release');
  });

  it('merges multiple pipeline documents', () => {
    const docs: PipelineDocument[] = [
      {
        name: 'release',
        version: 1,
        stages: [{ id: 'ci', workflow: '.github/workflows/ci.yml' }],
      },
      {
        version: 2,
        pipelines: {
          deploy: {
            needs: ['release'],
            stages: [{ id: 'gate', workflow: '.github/workflows/gate.yml' }],
          },
        },
      },
    ];

    const resolved = validatePipelineDocuments(docs);
    expect(resolved.stages.map((stage) => stage.id)).toEqual(['ci', 'gate']);
  });
});
