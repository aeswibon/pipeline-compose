import type { Pipeline, PipelineStage } from '@aeswibon/pipeline-compose-core';
import { evaluateExpression, mergeContext } from '@aeswibon/pipeline-compose-core';
import { resolveStageInputs } from './inputs.js';
import type { GitHubActionsClient, WorkflowJob } from './github.js';

export type OrchestratorOptions = {
  ref: string;
  github: Record<string, unknown>;
  timeoutMs?: number;
  pollMs?: number;
};

export type StageResult = {
  stageId: string;
  runId: number;
  outputs: Record<string, string>;
  skipped?: boolean;
};

function shouldRunStage(
  stage: PipelineStage,
  ctx: { github: Record<string, unknown>; context: Record<string, unknown> },
): boolean {
  if (!stage.when) {
    return true;
  }
  return evaluateExpression(stage.when, ctx);
}

function hasSkippedDependency(stage: PipelineStage, skipped: Set<string>): boolean {
  return (stage.needs ?? []).some((dep) => skipped.has(dep));
}

function missingRequiredContext(
  stage: PipelineStage,
  context: Record<string, Record<string, string>>,
): string | null {
  if (!stage.inputs) {
    return null;
  }
  for (const value of Object.values(stage.inputs)) {
    const match = value.match(/\$\{\{\s*context\.([a-z0-9-]+)\.([a-z0-9_]+)\s*\}\}/i);
    if (!match) {
      continue;
    }
    const [, stageId, outputKey] = match;
    if (!context[stageId]?.[outputKey]) {
      return `${stageId}.${outputKey}`;
    }
  }
  return null;
}

function outputsFromJobs(
  jobs: WorkflowJob[],
  declaredOutputs: string[],
): Record<string, string> | null {
  // ponytail: last successful job wins; upgrade path is explicit job name matching per stage
  for (let i = jobs.length - 1; i >= 0; i--) {
    const job = jobs[i];
    if (job.conclusion !== 'success' || !job.outputs) {
      continue;
    }
    if (declaredOutputs.every((key) => job.outputs?.[key] != null)) {
      return Object.fromEntries(
        declaredOutputs.map((key) => [key, job.outputs![key]]),
      );
    }
  }
  return null;
}

async function collectStageOutputs(
  client: GitHubActionsClient,
  runId: number,
  stageId: string,
  declaredOutputs: string[] | undefined,
  timeoutMs: number,
  pollMs: number,
): Promise<Record<string, string>> {
  if (!declaredOutputs?.length) {
    return {};
  }

  const jobs = await client.listRunJobs(runId);
  const fromApi = outputsFromJobs(jobs, declaredOutputs);
  if (fromApi) {
    return fromApi;
  }

  const fromArtifact = await client.waitForStageArtifact(
    runId,
    stageId,
    timeoutMs,
    pollMs,
  );
  if (declaredOutputs.every((key) => fromArtifact[key] != null)) {
    return Object.fromEntries(
      declaredOutputs.map((key) => [key, fromArtifact[key]]),
    );
  }

  throw new Error(
    `Could not find outputs for stage "${stageId}" (expected keys: ${declaredOutputs.join(', ')})`,
  );
}

export async function runPipeline(
  pipeline: Pipeline,
  client: GitHubActionsClient,
  options: OrchestratorOptions,
): Promise<StageResult[]> {
  const timeoutMs = options.timeoutMs ?? 60 * 60 * 1000;
  const pollMs = options.pollMs ?? 10_000;
  const results: StageResult[] = [];
  const skipped = new Set<string>();
  let context: Record<string, Record<string, string>> = {};

  for (const stage of pipeline.stages) {
    const evalCtx = {
      github: options.github,
      context: context as Record<string, unknown>,
    };

    if (hasSkippedDependency(stage, skipped)) {
      skipped.add(stage.id);
      results.push({ stageId: stage.id, runId: 0, outputs: {}, skipped: true });
      continue;
    }

    if (!shouldRunStage(stage, evalCtx)) {
      skipped.add(stage.id);
      results.push({ stageId: stage.id, runId: 0, outputs: {}, skipped: true });
      continue;
    }

    const missing = missingRequiredContext(stage, context);
    if (missing) {
      throw new Error(
        `Stage "${stage.id}" requires context.${missing} from a stage that did not run`,
      );
    }

    const workflow = await client.getWorkflowByPath(stage.workflow);
    const inputs = resolveStageInputs(stage.inputs, context);
    const dispatchAt = Date.now();

    await client.dispatchWorkflow(workflow.id, options.ref, inputs);

    let run = await client.waitForRun(
      workflow.id,
      options.ref,
      dispatchAt,
      timeoutMs,
      pollMs,
    );

    run = await client.waitForRunCompletion(run.id, timeoutMs, pollMs);

    if (run.conclusion !== 'success') {
      throw new Error(
        `Stage "${stage.id}" failed (${workflow.path}, run ${run.id}, conclusion=${run.conclusion})`,
      );
    }

    const outputs = await collectStageOutputs(
      client,
      run.id,
      stage.id,
      stage.outputs,
      timeoutMs,
      pollMs,
    );

    context = mergeContext(context, stage.id, outputs) as Record<
      string,
      Record<string, string>
    >;

    results.push({ stageId: stage.id, runId: run.id, outputs });
  }

  return results;
}
