import type { PipelineConcurrency } from '@aeswibon/pipeline-compose-core';
import {
  decodeGitHubFileContent,
  globalLockPath,
  parseGlobalLockRecord,
  resolveConcurrencyGroup,
  serializeGlobalLockRecord,
  type GlobalLockRecord,
} from '@aeswibon/pipeline-compose-core';
import { parseRepoSlug } from '@aeswibon/pipeline-compose-core';
import type { GitHubActionsClient } from './github.js';
import { resolveStageToken, type RepoTokenMap } from './repo-tokens.js';
import type { GitHubAppTokenProvider } from './github-app.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isActiveRunStatus(status: string): boolean {
  return (
    status === 'in_progress' ||
    status === 'queued' ||
    status === 'waiting' ||
    status === 'pending'
  );
}

async function clientForRepo(
  lockRepo: string,
  defaultOwner: string,
  defaultRepo: string,
  githubToken: string,
  repoTokens: RepoTokenMap,
  appTokenProvider: GitHubAppTokenProvider | undefined,
  baseClient: GitHubActionsClient,
): Promise<GitHubActionsClient> {
  const defaultSlug = `${defaultOwner}/${defaultRepo}`;
  if (lockRepo === defaultSlug) {
    return baseClient;
  }
  const { owner, repo } = parseRepoSlug(lockRepo);
  let token: string;
  try {
    token = resolveStageToken(lockRepo, defaultSlug, githubToken, repoTokens);
  } catch (error) {
    if (!appTokenProvider) {
      throw error;
    }
    token = await appTokenProvider.tokenForRepo(owner, repo);
  }
  return baseClient.withRepo(owner, repo, token);
}

async function holderRunActive(
  client: GitHubActionsClient,
  holder: GlobalLockRecord['holder'],
): Promise<boolean> {
  try {
    const run = await client.getWorkflowRun(holder.workflow_run_id);
    return isActiveRunStatus(run.status);
  } catch {
    return false;
  }
}

export async function acquireGlobalConcurrencyLock(
  baseClient: GitHubActionsClient,
  options: {
    concurrency: PipelineConcurrency;
    github: Record<string, unknown>;
    currentRunId: number;
    defaultOwner: string;
    defaultRepo: string;
    githubToken: string;
    repoTokens: RepoTokenMap;
    appTokenProvider?: GitHubAppTokenProvider;
    pollMs: number;
    timeoutMs: number;
  },
): Promise<{ release: () => Promise<void> }> {
  const group = resolveConcurrencyGroup(options.concurrency.group, options.github);
  const lockRepo =
    options.concurrency.lock_repo ?? `${options.defaultOwner}/${options.defaultRepo}`;
  const lockClient = await clientForRepo(
    lockRepo,
    options.defaultOwner,
    options.defaultRepo,
    options.githubToken,
    options.repoTokens,
    options.appTokenProvider,
    baseClient,
  );
  const path = globalLockPath(group);
  const cancel = options.concurrency.cancel_in_progress ?? false;
  const deadline = Date.now() + options.timeoutMs;
  const holder = {
    owner: options.defaultOwner,
    repo: options.defaultRepo,
    workflow_run_id: options.currentRunId,
  };

  while (Date.now() < deadline) {
    const existing = await lockClient.getRepositoryContent(path);
    if (!existing) {
      const record: GlobalLockRecord = {
        version: 1,
        group,
        holder,
        acquired_at: new Date().toISOString(),
      };
      try {
        await lockClient.putRepositoryContent(
          path,
          `pipeline-compose: acquire global lock ${group}`,
          serializeGlobalLockRecord(record),
        );
        return {
          release: async () => {
            const current = await lockClient.getRepositoryContent(path);
            if (!current) {
              return;
            }
            const parsed = parseGlobalLockRecord(
              decodeGitHubFileContent(current.content, current.encoding),
            );
            if (parsed?.holder.workflow_run_id === options.currentRunId) {
              await lockClient.deleteRepositoryContent(
                path,
                `pipeline-compose: release global lock ${group}`,
                current.sha,
              );
            }
          },
        };
      } catch {
        await sleep(options.pollMs);
        continue;
      }
    }

    const parsed = parseGlobalLockRecord(
      decodeGitHubFileContent(existing.content, existing.encoding),
    );
    if (!parsed) {
      await lockClient.putRepositoryContent(
        path,
        `pipeline-compose: replace invalid global lock ${group}`,
        serializeGlobalLockRecord({
          version: 1,
          group,
          holder,
          acquired_at: new Date().toISOString(),
        }),
        existing.sha,
      );
      return {
        release: async () => {
          const current = await lockClient.getRepositoryContent(path);
          if (current) {
            await lockClient.deleteRepositoryContent(
              path,
              `pipeline-compose: release global lock ${group}`,
              current.sha,
            );
          }
        },
      };
    }

    if (parsed.holder.workflow_run_id === options.currentRunId) {
      return { release: async () => {} };
    }

    const holderClient = await clientForRepo(
      `${parsed.holder.owner}/${parsed.holder.repo}`,
      options.defaultOwner,
      options.defaultRepo,
      options.githubToken,
      options.repoTokens,
      options.appTokenProvider,
      baseClient,
    );
    const active = await holderRunActive(holderClient, parsed.holder);
    if (!active) {
      await lockClient.putRepositoryContent(
        path,
        `pipeline-compose: steal stale global lock ${group}`,
        serializeGlobalLockRecord({
          version: 1,
          group,
          holder,
          acquired_at: new Date().toISOString(),
        }),
        existing.sha,
      );
      return {
        release: async () => {
          const current = await lockClient.getRepositoryContent(path);
          if (current) {
            await lockClient.deleteRepositoryContent(
              path,
              `pipeline-compose: release global lock ${group}`,
              current.sha,
            );
          }
        },
      };
    }

    if (cancel) {
      await holderClient.cancelWorkflowRun(parsed.holder.workflow_run_id);
      await sleep(options.pollMs);
      continue;
    }

    await sleep(options.pollMs);
  }

  throw new Error(`Timed out waiting for global concurrency lock (group: ${group})`);
}
