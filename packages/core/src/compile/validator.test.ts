import { describe, it, expect } from 'vitest';
import {
  validatePipeline,
  validatePipelineDocument,
  validatePipelineDocumentForReport,
  validatePipelineDocuments,
  V1_UNSUPPORTED_MESSAGE,
} from './validator.js';
import type { Pipeline, PipelineDocument } from './parser.js';

describe('validatePipeline', () => {
  it('rejects pipeline v1 objects', () => {
    const legacy: Pipeline = {
      name: 'release',
      version: 1,
      stages: [{ id: 'ci', workflow: '.github/workflows/ci.yml' }],
    };
    expect(() => validatePipeline(legacy)).toThrow(V1_UNSUPPORTED_MESSAGE);
  });
});

describe('validatePipelineDocument', () => {
  it('rejects pipeline v1 documents', () => {
    const doc: PipelineDocument = {
      name: 'release',
      version: 1,
      stages: [{ id: 'ci', workflow: '.github/workflows/ci.yml' }],
    };
    expect(() => validatePipelineDocument(doc)).toThrow(V1_UNSUPPORTED_MESSAGE);
  });

  it('validates v2 pipeline documents', () => {
    const doc: PipelineDocument = {
      version: 2,
      pipelines: {
        release: {
          group: 'release',
          stages: [
            { id: 'ci', workflow: '.github/workflows/ci.yml' },
            {
              id: 'publish',
              workflow: '.github/workflows/publish.yml',
              needs: ['ci'],
            },
          ],
        },
      },
    };
    const resolved = validatePipelineDocument(doc);
    expect(resolved.stages.map((stage) => stage.id)).toEqual(['ci', 'publish']);
    expect(resolved.stages[0].resolvedGroup).toBe('release');
  });

  it('accepts v2 companion_workflows at document root', () => {
    const doc: PipelineDocument = {
      version: 2,
      companion_workflows: ['.github/workflows/release.yml'],
      pipelines: {
        release: {
          stages: [{ id: 'ci', workflow: '.github/workflows/ci.yml' }],
        },
      },
    };
    const resolved = validatePipelineDocument(doc);
    expect(resolved.companion_workflows).toEqual(['.github/workflows/release.yml']);
  });

  it('rejects duplicate stage ids', () => {
    const doc: PipelineDocument = {
      version: 2,
      pipelines: {
        release: {
          stages: [
            { id: 'ci', workflow: '.github/workflows/ci.yml' },
            { id: 'ci', workflow: '.github/workflows/other.yml' },
          ],
        },
      },
    };
    expect(() => validatePipelineDocument(doc)).toThrow(/Duplicate stage id: ci/);
  });

  it('rejects schema violations', () => {
    const doc = {
      version: 2,
      pipelines: {
        release: {
          stages: [{ id: 'Bad Id', workflow: '.github/workflows/ci.yml' }],
        },
      },
    } as PipelineDocument;
    expect(() => validatePipelineDocument(doc)).toThrow(/Invalid pipeline v2/);
  });

  it('rejects unknown needs at strict validate time', () => {
    const doc: PipelineDocument = {
      version: 2,
      pipelines: {
        release: {
          stages: [
            { id: 'deploy', workflow: '.github/workflows/deploy.yml', needs: ['missing'] },
          ],
        },
      },
    };
    expect(() => validatePipelineDocument(doc)).toThrow(/Unknown stage in needs: missing/);
  });
});

describe('validatePipelineDocumentForReport', () => {
  it('loads pipelines with unknown needs for validate reporting', () => {
    const doc: PipelineDocument = {
      version: 2,
      pipelines: {
        release: {
          stages: [
            { id: 'deploy', workflow: '.github/workflows/deploy.yml', needs: ['missing'] },
          ],
        },
      },
    };
    const resolved = validatePipelineDocumentForReport(doc);
    expect(resolved.stages.map((stage) => stage.id)).toEqual(['deploy']);
  });
});

describe('validatePipelineDocuments', () => {
  it('merges multiple v2 pipeline documents', () => {
    const docs: PipelineDocument[] = [
      {
        version: 2,
        pipelines: {
          release: {
            stages: [{ id: 'ci', workflow: '.github/workflows/ci.yml' }],
          },
        },
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
    expect(resolved.schemaVersion).toBe(2);
  });

  it('rejects v1 documents in a directory merge', () => {
    const docs: PipelineDocument[] = [
      {
        name: 'release',
        version: 1,
        stages: [{ id: 'ci', workflow: '.github/workflows/ci.yml' }],
      },
    ];
    expect(() => validatePipelineDocuments(docs)).toThrow(V1_UNSUPPORTED_MESSAGE);
  });
});
