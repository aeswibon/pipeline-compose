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
});
