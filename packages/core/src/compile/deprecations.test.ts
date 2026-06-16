import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResolvedPipeline } from './parser.js';
import {
  collectDeprecationIssues,
  collectStageExportDeprecations,
  collectWorkflowFileDeprecations,
} from './deprecations.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeRepo(workflows: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-compose-dep-'));
  tempDirs.push(root);
  for (const [relativePath, content] of Object.entries(workflows)) {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return root;
}

describe('collectWorkflowFileDeprecations', () => {
  it('errors on monorepo subpath uses', () => {
    const repo = makeRepo({
      '.github/workflows/release.yml': `
jobs:
  run:
    steps:
      - uses: aeswibon/pipeline-compose/run@v0.1.0
`,
    });
    const issues = collectWorkflowFileDeprecations(repo, '.github/workflows/release.yml');
    const issue = issues.find((item) => item.code === 'uses.monorepo-subpath-deprecated');
    expect(issue?.level).toBe('error');
  });

  it('errors on @master pins', () => {
    const repo = makeRepo({
      '.github/workflows/ci.yml': `
jobs:
  test:
    steps:
      - uses: aeswibon/pipeline-compose-run@master
`,
    });
    const issues = collectWorkflowFileDeprecations(repo, '.github/workflows/ci.yml');
    const issue = issues.find((item) => item.code === 'uses.master-pin-deprecated');
    expect(issue?.level).toBe('error');
  });
});

describe('collectStageExportDeprecations', () => {
  it('errors when manual upload is used without export action', () => {
    const repo = makeRepo({
      '.github/workflows/stage-version-sync.yml': `
jobs:
  sync:
    steps:
      - run: jq -n '{version:"1"}' > pipeline-compose/outputs.json
      - uses: actions/upload-artifact@v7
        with:
          name: pipeline-compose-version-sync
          path: pipeline-compose/outputs.json
`,
    });
    const issues = collectStageExportDeprecations(repo, {
      id: 'version-sync',
      workflow: '.github/workflows/stage-version-sync.yml',
      outputs: ['version'],
    });
    const issue = issues.find((item) => item.code === 'export.manual-upload-deprecated');
    expect(issue?.level).toBe('error');
  });

  it('accepts pipeline-compose-export action', () => {
    const repo = makeRepo({
      '.github/workflows/stage-version-sync.yml': `
jobs:
  sync:
    steps:
      - uses: aeswibon/pipeline-compose-export@v1.8.0
        with:
          stage_id: version-sync
          outputs: '{"version":"1.0.0"}'
`,
    });
    const issues = collectStageExportDeprecations(repo, {
      id: 'version-sync',
      workflow: '.github/workflows/stage-version-sync.yml',
      outputs: ['version'],
    });
    expect(issues).toEqual([]);
  });

  it('accepts local action-export path', () => {
    const repo = makeRepo({
      '.github/workflows/stage-version-sync.yml': `
jobs:
  sync:
    steps:
      - uses: ./packages/action-export
`,
    });
    const issues = collectStageExportDeprecations(repo, {
      id: 'version-sync',
      workflow: '.github/workflows/stage-version-sync.yml',
      outputs: ['version'],
    });
    expect(issues).toEqual([]);
  });
});

describe('collectDeprecationIssues', () => {
  it('collects workflow and export issues for resolved pipelines', () => {
    const pipeline: ResolvedPipeline = {
      name: 'release',
      version: 2,
      schemaVersion: 2,
      stages: [
        {
          id: 'version-sync',
          workflow: '.github/workflows/stage-version-sync.yml',
          outputs: ['version'],
        },
      ],
      companion_workflows: ['.github/workflows/release.yml'],
    };
    const repo = makeRepo({
      '.github/workflows/stage-version-sync.yml': `
jobs:
  sync:
    steps:
      - run: echo ok
`,
      '.github/workflows/release.yml': `
jobs:
  run:
    steps:
      - uses: aeswibon/pipeline-compose-run@master
`,
    });
    const issues = collectDeprecationIssues(pipeline, repo);
    expect(issues.some((issue) => issue.code === 'export.missing')).toBe(true);
    expect(issues.some((issue) => issue.code === 'uses.master-pin-deprecated')).toBe(true);
  });
});
