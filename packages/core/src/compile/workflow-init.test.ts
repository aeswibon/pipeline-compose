import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderInitPipelineYaml,
  scanWorkflowsForInit,
  writeInitPipeline,
} from './workflow-init.js';

describe('workflow-init', () => {
  let tmpDir = '';

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = '';
    }
  });

  function writeWorkflow(name: string, body: string): void {
    const dir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), body, 'utf8');
  }

  it('builds stages from dispatch workflows and local uses refs', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-init-'));
    writeWorkflow(
      'ci.yml',
      `name: CI\non:\n  workflow_dispatch:\n  workflow_call:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n`,
    );
    writeWorkflow(
      'deploy.yml',
      `name: Deploy\non:\n  workflow_dispatch:\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/workflows/ci.yml\n`,
    );

    const result = scanWorkflowsForInit(tmpDir);
    expect(result.stages.map((stage) => stage.id)).toEqual(['ci', 'deploy']);
    expect(result.stages[1].needs).toEqual(['ci']);
  });

  it('writes starter pipeline.yml', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-init-'));
    writeWorkflow(
      'ci.yml',
      `name: CI\non: workflow_dispatch\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n`,
    );

    const { outputPath } = writeInitPipeline(tmpDir);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.readFileSync(outputPath, 'utf8')).toContain('id: ci');
  });

  it('renders yaml with needs blocks', () => {
    const yaml = renderInitPipelineYaml([
      { id: 'ci', workflow: '.github/workflows/ci.yml' },
      { id: 'deploy', workflow: '.github/workflows/deploy.yml', needs: ['ci'] },
    ]);
    expect(yaml).toContain('needs:');
    expect(yaml).toContain('- ci');
  });
});
