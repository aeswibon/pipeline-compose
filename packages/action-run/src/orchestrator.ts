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

function outputsFromJobs(
  jobs: WorkflowJob[],
  declaredOutputs: string[],
): Record<string, string> | null {
  for (const job of jobs) {
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
  let context: Record<string, Record<string, string>> = {};

  for (const stage of pipeline.stages) {
    const evalCtx = {
      github: options.github,
      context: context as Record<string, unknown>,
    };

    if (!shouldRunStage(stage, evalCtx)) {
      continue;
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
