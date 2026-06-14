import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import {
  loadPipelineDocumentFromFile,
  loadPipelineDocumentsFromDirectory,
  loadPipelineDocumentsFromInputs,
} from './pipeline-load.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeDir(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-load-'));
  tempDirs.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const fullPath = path.join(root, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return root;
}

describe('pipeline-load', () => {
  it('loads a single pipeline file', () => {
    const root = makeDir({
      'pipeline.yml': `
name: release
version: 1
stages:
  - id: ci
    workflow: .github/workflows/ci.yml
`,
    });
    const file = path.join(root, 'pipeline.yml');
    const doc = loadPipelineDocumentFromFile(file);
    expect(doc).toMatchObject({ name: 'release', version: 1 });
  });

  it('loads all pipeline files from a directory', () => {
    const root = makeDir({
      'pipelines/release.yml': `
name: release
version: 1
stages:
  - id: ci
    workflow: .github/workflows/ci.yml
`,
      'pipelines/deploy.yml': `
name: deploy
version: 1
needs: [release]
stages:
  - id: gate
    workflow: .github/workflows/gate.yml
`,
    });
    const docs = loadPipelineDocumentsFromDirectory(path.join(root, 'pipelines'));
    expect(docs).toHaveLength(2);
  });

  it('rejects conflicting pipeline_file and pipeline_dir', () => {
    expect(() =>
      loadPipelineDocumentsFromInputs({
        pipelineFile: 'a.yml',
        pipelineDir: 'pipelines',
      }),
    ).toThrow(/not both/);
  });
});
