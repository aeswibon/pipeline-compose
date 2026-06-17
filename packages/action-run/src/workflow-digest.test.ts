import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { contentDigest, workflowFileDigest, workflowRemoteDigest } from './workflow-digest.js';

describe('contentDigest', () => {
  it('is stable for the same content', () => {
    expect(contentDigest('hello')).toBe(contentDigest('hello'));
    expect(contentDigest('hello')).not.toBe(contentDigest('world'));
  });
});

describe('workflowFileDigest', () => {
  it('hashes workflow file contents', () => {
    const root = mkdtempSync(join(tmpdir(), 'pc-wf-'));
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    writeFileSync(join(root, '.github/workflows/ci.yml'), 'name: ci\n');
    const digest = workflowFileDigest(root, '.github/workflows/ci.yml');
    expect(digest).toHaveLength(16);
    expect(workflowFileDigest(root, '.github/workflows/ci.yml')).toBe(digest);
  });

  it('hashes pipeline yaml files the same way as workflows', () => {
    const root = mkdtempSync(join(tmpdir(), 'pc-pipe-'));
    mkdirSync(join(root, '.github/pipelines'), { recursive: true });
    writeFileSync(join(root, '.github/pipelines/pr.yml'), 'version: 2\n');
    const digest = workflowFileDigest(root, '.github/pipelines/pr.yml');
    expect(digest).toHaveLength(16);
  });

  it('returns undefined for missing files', () => {
    expect(workflowFileDigest('/tmp/missing', '.github/workflows/none.yml')).toBeUndefined();
  });
});

describe('workflowRemoteDigest', () => {
  it('hashes repository file content from the Contents API', async () => {
    const client = {
      getRepositoryContent: vi.fn(async () => ({
        sha: 'abc',
        encoding: 'base64',
        content: Buffer.from('name: remote\n', 'utf8').toString('base64'),
      })),
    };
    const digest = await workflowRemoteDigest(
      client as never,
      '.github/workflows/remote.yml',
      'refs/heads/main',
    );
    expect(digest).toBe(contentDigest('name: remote\n'));
    expect(client.getRepositoryContent).toHaveBeenCalledWith(
      '.github/workflows/remote.yml',
      'refs/heads/main',
    );
  });

  it('hashes remote pipeline yaml paths the same as workflows', async () => {
    const client = {
      getRepositoryContent: vi.fn(async () => ({
        sha: 'abc',
        encoding: 'base64',
        content: Buffer.from('version: 2\n', 'utf8').toString('base64'),
      })),
    };
    const digest = await workflowRemoteDigest(
      client as never,
      '.github/pipelines/inner.yml',
      'refs/heads/main',
    );
    expect(digest).toBe(contentDigest('version: 2\n'));
  });
});
