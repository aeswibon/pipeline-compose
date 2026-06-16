import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectSubPipelineOutputs,
  nestedDeclaredOutputs,
  resolveSubPipeline,
} from './sub-pipeline.js';
import { validatePipelineDocument } from './validator.js';
import { collectContextSchemaIssues } from '../lib/context-schema.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeRepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-sub-'));
  tempDirs.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const fullPath = path.join(root, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return root;
}

describe('resolveSubPipeline', () => {
  it('loads a nested pipeline by key', () => {
    const root = makeRepo({
      '.github/pipelines/pr.yml': `
version: 2
pipelines:
  pr:
    stages:
      - id: test
        workflow: .github/workflows/test.yml
`,
      '.github/workflows/test.yml': 'on: workflow_dispatch\n',
    });

    const nested = resolveSubPipeline(root, '.github/pipelines/pr.yml', 'pr');
    expect(nested.stages.map((stage) => stage.id)).toEqual(['test']);
  });

  it('rejects nested sub-pipelines', () => {
    const root = makeRepo({
      '.github/pipelines/outer.yml': `
version: 2
pipelines:
  outer:
    stages:
      - id: bundle
        pipeline_file: .github/pipelines/inner.yml
        pipeline: inner
`,
      '.github/pipelines/inner.yml': `
version: 2
pipelines:
  inner:
    stages:
      - id: nested
        pipeline_file: .github/pipelines/deep.yml
`,
    });

    expect(() =>
      resolveSubPipeline(root, '.github/pipelines/outer.yml', 'outer'),
    ).toThrow(/one level/);
  });
});

describe('collectSubPipelineOutputs', () => {
  it('collects declared outputs from nested stage results', () => {
    const outputs = collectSubPipelineOutputs(
      [
        { stageId: 'test', outputs: { ok: 'true' } },
        { stageId: 'build', outputs: { image_tag: '1.2.3' } },
      ],
      ['image_tag'],
      'bundle',
    );
    expect(outputs).toEqual({ image_tag: '1.2.3' });
  });
});

describe('context_schema validation', () => {
  it('flags unknown context refs against schema', () => {
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
                missing: '${{ context.version-sync.missing }}',
              },
            },
          ],
        },
      },
    });

    const issues = collectContextSchemaIssues(pipeline);
    expect(issues.some((issue) => issue.code === 'context-schema.unknown-ref')).toBe(true);
    expect(nestedDeclaredOutputs(pipeline).has('version')).toBe(true);
  });
});
