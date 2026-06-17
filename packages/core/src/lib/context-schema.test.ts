import { describe, expect, it } from 'vitest';
import { collectContextSchemaIssues, validateStageOutputsAgainstSchema } from './context-schema.js';
import { validatePipelineDocument } from '../compile/validator.js';

describe('collectContextSchemaIssues', () => {
  it('accepts declared outputs and context refs covered by schema', () => {
    const pipeline = validatePipelineDocument({
      version: 2,
      pipelines: {
        release: {
          context_schema: {
            type: 'object',
            properties: {
              'version-sync': {
                type: 'object',
                properties: {
                  version: { type: 'string' },
                },
              },
            },
          },
          stages: [
            {
              id: 'version-sync',
              workflow: '.github/workflows/version.yml',
              outputs: ['version'],
            },
            {
              id: 'publish',
              workflow: '.github/workflows/publish.yml',
              needs: ['version-sync'],
              inputs: {
                version: '${{ context.version-sync.version }}',
              },
            },
          ],
        },
      },
    });

    expect(collectContextSchemaIssues(pipeline)).toEqual([]);
  });
});

describe('validateStageOutputsAgainstSchema', () => {
  const schema = {
    type: 'object',
    properties: {
      'version-sync': {
        type: 'object',
        properties: {
          version: { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$' },
          skip_publish: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
  };

  it('accepts outputs matching the stage schema', () => {
    expect(
      validateStageOutputsAgainstSchema(
        'version-sync',
        { version: '1.2.3', skip_publish: 'false' },
        schema,
      ),
    ).toBeNull();
  });

  it('rejects outputs that fail schema constraints', () => {
    expect(
      validateStageOutputsAgainstSchema(
        'version-sync',
        { version: 'not-semver', skip_publish: 'false' },
        schema,
      ),
    ).toMatch(/pattern/);
  });
});
