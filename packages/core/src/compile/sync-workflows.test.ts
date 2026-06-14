import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import { buildSyncPlan, formatWorkflowSyncPreview, previewWorkflowSync, runWorkflowSync } from './sync-workflows.js';
import type { ResolvedPipeline } from './parser.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeRepo(layout: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-sync-'));
  tempDirs.push(root);
  for (const [relative, content] of Object.entries(layout)) {
    const fullPath = path.join(root, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return root;
}

describe('runWorkflowSync', () => {
  it('copies source workflows into stage targets', () => {
    const repoRoot = makeRepo({
      'workflows/release/ci.yml': 'name: ci\n',
    });

    const pipeline: ResolvedPipeline = {
      name: 'release',
      version: 1,
      group: 'release',
      stages: [
        {
          id: 'ci',
          workflow: '.github/workflows/release-ci.yml',
          resolvedGroup: 'release',
        },
      ],
    };

    const plan = buildSyncPlan(pipeline, repoRoot);
    const result = runWorkflowSync(plan, repoRoot);

    expect(result.copied).toEqual(['.github/workflows/release-ci.yml']);
    expect(fs.readFileSync(path.join(repoRoot, '.github/workflows/release-ci.yml'), 'utf8')).toBe(
      'name: ci\n',
    );
  });

  it('fails check mode when target is stale', () => {
    const repoRoot = makeRepo({
      'workflows/release/ci.yml': 'name: ci\n',
      '.github/workflows/release-ci.yml': 'name: old\n',
    });

    const pipeline: ResolvedPipeline = {
      name: 'release',
      version: 1,
      stages: [
        {
          id: 'ci',
          workflow: '.github/workflows/release-ci.yml',
          resolvedGroup: 'release',
        },
      ],
    };

    const plan = buildSyncPlan(pipeline, repoRoot);
    expect(() => runWorkflowSync(plan, repoRoot, true)).toThrow(/Stale workflow target/);
  });

  it('previews create and update actions without writing files', () => {
    const repoRoot = makeRepo({
      'workflows/deploy/gate.yml': 'name: gate\n',
      'workflows/release/ci.yml': 'name: ci\n',
      '.github/workflows/release-ci.yml': 'name: old\n',
    });

    const pipeline: ResolvedPipeline = {
      name: 'release',
      version: 1,
      stages: [
        {
          id: 'gate',
          workflow: '.github/workflows/deploy-gate.yml',
          resolvedGroup: 'deploy',
        },
        {
          id: 'ci',
          workflow: '.github/workflows/release-ci.yml',
          resolvedGroup: 'release',
        },
      ],
    };

    const preview = previewWorkflowSync(buildSyncPlan(pipeline, repoRoot), repoRoot);
    expect(preview.create).toContain('.github/workflows/deploy-gate.yml');
    expect(preview.update).toContain('.github/workflows/release-ci.yml');
    expect(formatWorkflowSyncPreview(preview)).toContain('create .github/workflows/deploy-gate.yml');
  });

  it('previews up-to-date targets and missing sources', () => {
    const repoRoot = makeRepo({
      'workflows/release/ci.yml': 'name: ci\n',
      '.github/workflows/release-ci.yml': 'name: ci\n',
    });

    const pipeline: ResolvedPipeline = {
      name: 'release',
      version: 1,
      stages: [
        {
          id: 'ci',
          workflow: '.github/workflows/release-ci.yml',
          resolvedGroup: 'release',
        },
        {
          id: 'missing',
          workflow: '.github/workflows/missing.yml',
          resolvedGroup: 'release',
        },
      ],
    };

    const preview = previewWorkflowSync(buildSyncPlan(pipeline, repoRoot), repoRoot);
    expect(preview.upToDate).toContain('.github/workflows/release-ci.yml');
    expect(preview.missingSources).toContain('workflows/release/missing.yml');
    expect(formatWorkflowSyncPreview(preview)).toContain('up-to-date');
    expect(formatWorkflowSyncPreview(preview)).toContain('missing-source');
  });

  it('uses workflows/sync.yml overrides when present', () => {
    const repoRoot = makeRepo({
      'workflows/sync.yml': `
mappings:
  - from: workflows/custom/source.yml
    to: .github/workflows/custom-target.yml
`,
      'workflows/custom/source.yml': 'name: custom\n',
    });

    const pipeline: ResolvedPipeline = {
      name: 'release',
      version: 1,
      stages: [],
    };

    const plan = buildSyncPlan(pipeline, repoRoot);
    expect(plan.mappings).toEqual([
      {
        from: 'workflows/custom/source.yml',
        to: '.github/workflows/custom-target.yml',
      },
    ]);
  });

  it('reports no changes when preview is empty', () => {
    expect(
      formatWorkflowSyncPreview({
        create: [],
        update: [],
        upToDate: [],
        missingSources: [],
      }),
    ).toBe('No workflow sync changes.');
  });
});
