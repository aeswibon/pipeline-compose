import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectCrossRepoSlugs, collectRepoAccessIssues } from './repo-access-check.js';
import type { ResolvedPipeline } from '../compile/parser.js';

describe('collectCrossRepoSlugs', () => {
  let tmpDir = '';

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = '';
    }
  });

  it('collects repo slugs from nested sub-pipelines', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-repo-slugs-'));
    const innerDir = path.join(tmpDir, '.github', 'pipelines');
    fs.mkdirSync(innerDir, { recursive: true });
    fs.writeFileSync(
      path.join(innerDir, 'inner.yml'),
      `version: 2
pipelines:
  inner:
    stages:
      - id: remote
        repo: my-org/remote
        workflow: .github/workflows/remote.yml
`,
      'utf8',
    );

    const pipeline: ResolvedPipeline = {
      name: 'p',
      version: 1,
      stages: [
        {
          id: 'bundle',
          pipeline_file: '.github/pipelines/inner.yml',
        },
      ],
    };

    expect(collectCrossRepoSlugs(pipeline, tmpDir)).toEqual(['my-org/remote']);
  });
});

describe('collectRepoAccessIssues', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports missing repository access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    const issues = await collectRepoAccessIssues(['my-org/missing'], 'ghp_test');
    expect(issues).toEqual([
      expect.objectContaining({ code: 'repo.access-denied', level: 'error' }),
    ]);
  });

  it('accepts reachable repositories', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    const issues = await collectRepoAccessIssues(['my-org/ok'], 'ghp_test');
    expect(issues).toEqual([]);
  });
});
