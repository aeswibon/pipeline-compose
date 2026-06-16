import type { PipelineConcurrency } from '@aeswibon/pipeline-compose-core';
import { resolveConcurrencyGroup } from '@aeswibon/pipeline-compose-core';
import type { GitHubActionsClient, WorkflowRun } from './github.js';
import { stripRefPrefix } from './github.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isActiveRun(run: WorkflowRun): boolean {
  return (
    run.status === 'in_progress' ||
    run.status === 'queued' ||
    run.status === 'waiting' ||
    run.status === 'pending'
  );
}

function sameRefRun(run: WorkflowRun, ref: string): boolean {
  const refName = stripRefPrefix(ref);
  if (run.head_branch === refName) {
    return true;
  }
  if (ref.startsWith('refs/tags/') && run.head_branch == null) {
    return true;
  }
  return false;
}

async function findConflictingRuns(
  client: GitHubActionsClient,
  workflowId: number,
  currentRunId: number,
  ref: string,
): Promise<WorkflowRun[]> {
  const [inProgress, queued] = await Promise.all([
    client.listWorkflowRuns(workflowId, { status: 'in_progress' }),
    client.listWorkflowRuns(workflowId, { status: 'queued' }),
  ]);
  const seen = new Set<number>();
  const active: WorkflowRun[] = [];
  for (const run of [...inProgress, ...queued]) {
    if (seen.has(run.id) || run.id === currentRunId) {
      continue;
    }
    if (!isActiveRun(run) || !sameRefRun(run, ref)) {
      continue;
    }
    seen.add(run.id);
    active.push(run);
  }
  return active;
}

export async function enforcePipelineConcurrency(
  client: GitHubActionsClient,
  options: {
    currentRunId: number;
    ref: string;
    concurrency: PipelineConcurrency;
    github: Record<string, unknown>;
    pollMs: number;
    timeoutMs: number;
  },
): Promise<void> {
  const { currentRunId, ref, concurrency, github, pollMs, timeoutMs } = options;
  const group = resolveConcurrencyGroup(concurrency.group, github);
  const cancel = concurrency.cancel_in_progress ?? false;
  const current = await client.getWorkflowRun(currentRunId);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const conflicts = await findConflictingRuns(
      client,
      current.workflow_id,
      currentRunId,
      ref,
    );
    if (conflicts.length === 0) {
      return;
    }
    if (cancel) {
      await Promise.all(conflicts.map((run) => client.cancelWorkflowRun(run.id)));
      await sleep(pollMs);
      continue;
    }
    await sleep(pollMs);
  }

  throw new Error(
    `Timed out waiting for concurrent pipeline run(s) (concurrency group: ${group})`,
  );
}
