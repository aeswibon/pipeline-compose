import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { workflowFileDigest } from './workflow-digest.js';

describe('workflowFileDigest', () => {
  it('hashes workflow file contents', () => {
    const root = mkdtempSync(join(tmpdir(), 'pc-wf-'));
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    writeFileSync(join(root, '.github/workflows/ci.yml'), 'name: ci\n');
    const digest = workflowFileDigest(root, '.github/workflows/ci.yml');
    expect(digest).toHaveLength(16);
    expect(workflowFileDigest(root, '.github/workflows/ci.yml')).toBe(digest);
  });

  it('returns undefined for missing files', () => {
    expect(workflowFileDigest('/tmp/missing', '.github/workflows/none.yml')).toBeUndefined();
  });
});
