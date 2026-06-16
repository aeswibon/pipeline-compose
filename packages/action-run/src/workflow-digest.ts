import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** ponytail: same-repo workflow files only; cross-repo digest needs Contents API. */
export function workflowFileDigest(repoRoot: string, workflowPath: string): string | undefined {
  try {
    const content = readFileSync(join(repoRoot, workflowPath), 'utf8');
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch {
    return undefined;
  }
}
