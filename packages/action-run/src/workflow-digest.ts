import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GitHubActionsClient } from './github.js';

export function contentDigest(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function workflowFileDigest(repoRoot: string, workflowPath: string): string | undefined {
  try {
    const content = readFileSync(join(repoRoot, workflowPath), 'utf8');
    return contentDigest(content);
  } catch {
    return undefined;
  }
}

function decodeRepositoryContent(content: string, encoding: string): string {
  if (encoding === 'base64') {
    return Buffer.from(content, 'base64').toString('utf8');
  }
  return content;
}

export async function workflowRemoteDigest(
  client: GitHubActionsClient,
  workflowPath: string,
  ref: string,
): Promise<string | undefined> {
  const file = await client.getRepositoryContent(workflowPath, ref);
  if (!file) {
    return undefined;
  }
  return contentDigest(decodeRepositoryContent(file.content, file.encoding));
}
