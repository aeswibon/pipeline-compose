import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import {
  buildValidateReport,
  findOrphanWorkflows,
  formatPipelineTree,
  formatValidateReport,
  serializeValidateReport,
  validateReportExitCode,
  workflowMatchesGroupConvention,
} from './validate-report.js';
import type { ResolvedPipeline } from './parser.js';

const samplePipeline: ResolvedPipeline = {
  name: 'release',
  version: 1,
  group: 'release',
  groups: {
    release: { description: 'Tag release chain' },
  },
  stages: [
    {
      id: 'ci',
      workflow: '.github/workflows/ci.yml',
      resolvedGroup: 'release',
    },
    {
      id: 'sync',
      workflow: '.github/workflows/stage-version-sync.yml',
      resolvedGroup: 'release',
      needs: ['ci'],
    },
  ],
};

describe('workflowMatchesGroupConvention', () => {
  it('accepts group prefix and stage prefix', () => {
    expect(workflowMatchesGroupConvention('.github/workflows/release-ci.yml', 'release')).toBe(
      true,
    );
    expect(
      workflowMatchesGroupConvention('.github/workflows/stage-version-sync.yml', 'release'),
    ).toBe(true);
    expect(workflowMatchesGroupConvention('.github/workflows/ci.yml', 'release', 'ci')).toBe(true);
  });

  it('warns on unrelated filenames', () => {
    expect(workflowMatchesGroupConvention('.github/workflows/ci.yml', 'release')).toBe(false);
  });
});

describe('formatPipelineTree', () => {
  it('prints grouped stages with descriptions', () => {
    const tree = formatPipelineTree(samplePipeline);
    expect(tree).toContain('Pipeline: release (2 stage(s))');
    expect(tree).toContain('[release] — Tag release chain');
    expect(tree).toContain('ci → .github/workflows/ci.yml');
  });
});

describe('buildValidateReport', () => {
  it('promotes warnings to errors in strict mode', () => {
    const report = buildValidateReport(samplePipeline, { strict: true });
    expect(report.issues.some((issue) => issue.code === 'group.path-prefix')).toBe(false);
    expect(report.issues.every((issue) => issue.level === 'error')).toBe(true);
  });

  it('warns for cross-repo stages and errors on invalid repo slug', () => {
    const report = buildValidateReport({
      ...samplePipeline,
      stages: [
        {
          id: 'remote',
          workflow: '.github/workflows/remote.yml',
          repo: 'other-org/other-repo',
        },
        {
          id: 'bad',
          workflow: '.github/workflows/bad.yml',
          repo: 'not-a-slug',
        },
      ],
    });

    expect(report.issues.some((issue) => issue.code === 'stage.cross-repo')).toBe(true);
    expect(report.issues.some((issue) => issue.code === 'stage.repo-invalid')).toBe(true);
  });
});

describe('serializeValidateReport', () => {
  it('returns machine-readable JSON with pipeline summary', () => {
    const report = buildValidateReport(samplePipeline);
    const json = JSON.parse(serializeValidateReport(report)) as {
      ok: boolean;
      pipeline: { name: string; stageCount: number };
      issues: unknown[];
    };
    expect(json.ok).toBe(true);
    expect(json.pipeline.name).toBe('release');
    expect(json.pipeline.stageCount).toBe(2);
    expect(Array.isArray(json.issues)).toBe(true);
  });
});

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeRepo(layout: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-validate-'));
  tempDirs.push(root);
  for (const [relative, content] of Object.entries(layout)) {
    const fullPath = path.join(root, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return root;
}

describe('findOrphanWorkflows', () => {
  it('lists workflow files not referenced by stages or companions', () => {
    const repoRoot = makeRepo({
      '.github/workflows/ci.yml': 'name: ci\n',
      '.github/workflows/orphan.yml': 'name: orphan\n',
    });

    const orphans = findOrphanWorkflows(repoRoot, {
      ...samplePipeline,
      stages: [
        {
          id: 'ci',
          workflow: '.github/workflows/ci.yml',
        },
      ],
    });

    expect(orphans).toEqual(['.github/workflows/orphan.yml']);
  });
});

describe('formatValidateReport', () => {
  it('prints grouped and ungrouped stages with issue lines', () => {
    const report = buildValidateReport({
      name: 'mixed',
      version: 1,
      stages: [
        { id: 'grouped', workflow: '.github/workflows/release-grouped.yml', resolvedGroup: 'release' },
        { id: 'solo', workflow: '.github/workflows/solo.yml' },
      ],
    });

    const text = formatValidateReport(report);
    expect(text).toContain('[ungrouped]');
    expect(text).toContain('solo → .github/workflows/solo.yml');
    expect(validateReportExitCode(report)).toBe(0);
  });

  it('flags missing workflow files when repoRoot is provided', () => {
    const repoRoot = makeRepo({});
    const report = buildValidateReport(samplePipeline, { repoRoot });
    expect(report.issues.some((issue) => issue.code === 'workflow.missing')).toBe(true);
    expect(validateReportExitCode(report)).toBe(1);
  });

  it('warns about orphan workflows when workflows mode is enabled', () => {
    const repoRoot = makeRepo({
      '.github/workflows/ci.yml': 'name: ci\n',
      '.github/workflows/extra.yml': 'name: extra\n',
    });
    const report = buildValidateReport(samplePipeline, {
      repoRoot,
      workflows: true,
    });
    expect(report.issues.some((issue) => issue.code === 'workflow.orphan')).toBe(true);
  });
});
