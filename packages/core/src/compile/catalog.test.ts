import { describe, expect, it } from 'vitest';
import {
  collectCatalogStageIssues,
  collectDocumentCatalogIssues,
  expandCatalogStages,
} from './catalog.js';
import { resolvePipelineDocument } from './pipeline-resolve.js';
import { validatePipelineDocument } from './validator.js';

describe('catalog', () => {
  it('expands use into workflow and outputs', () => {
    const expanded = expandCatalogStages(
      [
        {
          id: 'version-sync',
          use: 'version-sync',
          needs: ['ci'],
        },
      ],
      {
        'version-sync': {
          workflow: '.github/workflows/stage-version-sync.yml',
          outputs: ['version'],
        },
      },
    );

    expect(expanded[0]).toMatchObject({
      id: 'version-sync',
      workflow: '.github/workflows/stage-version-sync.yml',
      outputs: ['version'],
      needs: ['ci'],
    });
    expect(expanded[0].use).toBeUndefined();
  });

  it('merges catalog inputs with stage overrides', () => {
    const expanded = expandCatalogStages(
      [
        {
          id: 'release-publish',
          use: 'release-publish',
          inputs: { version: '${{ context.version-sync.version }}' },
        },
      ],
      {
        'release-publish': {
          workflow: '.github/workflows/stage-release-publish.yml',
          inputs: { dry_run: 'false' },
        },
      },
    );

    expect(expanded[0].inputs).toEqual({
      dry_run: 'false',
      version: '${{ context.version-sync.version }}',
    });
  });

  it('reports unknown catalog entries', () => {
    const issues = collectCatalogStageIssues(
      [{ id: 'ci', use: 'missing' }],
      { other: { workflow: '.github/workflows/ci.yml' } },
    );
    expect(issues.map((issue) => issue.code)).toContain('catalog.unknown');
  });

  it('rejects use combined with workflow', () => {
    expect(() =>
      expandCatalogStages(
        [{ id: 'ci', use: 'ci', workflow: '.github/workflows/ci.yml' }],
        { ci: { workflow: '.github/workflows/ci.yml' } },
      ),
    ).toThrow(/cannot set use/);
  });

  it('resolves v2 pipelines with catalog', () => {
    const resolved = resolvePipelineDocument({
      version: 2,
      catalog: {
        ci: { workflow: '.github/workflows/ci.yml' },
      },
      pipelines: {
        release: {
          stages: [{ id: 'ci', use: 'ci' }],
        },
      },
    });

    expect(resolved.stages[0].workflow).toBe('.github/workflows/ci.yml');
  });

  it('validates schema with catalog and use', () => {
    const resolved = validatePipelineDocument({
      version: 2,
      catalog: {
        ci: { workflow: '.github/workflows/ci.yml' },
      },
      pipelines: {
        release: {
          stages: [{ id: 'ci', use: 'ci' }],
        },
      },
    });

    expect(resolved.stages[0].id).toBe('ci');
  });

  it('collects document-level catalog issues', () => {
    const issues = collectDocumentCatalogIssues({
      version: 2,
      catalog: {
        broken: { when: 'true' },
      },
      pipelines: {
        release: {
          stages: [{ id: 'ci', use: 'broken' }],
        },
      },
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['catalog.invalid-entry']),
    );
  });
});
