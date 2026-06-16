import { describe, expect, it } from 'vitest';
import { collectContextSchemaIssues } from './context-schema.js';
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
