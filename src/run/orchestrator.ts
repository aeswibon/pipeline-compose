import type { Pipeline, PipelineStage } from '../compile/parser.js';
import { evaluateExpression } from '../lib/expressions.js';
import { mergeContext } from '../lib/expressions.js';
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

function collectJobOutputs(
  jobs: WorkflowJob[],
  declaredOutputs: string[] | undefined,
): Record<string, string> {
  if (!declaredOutputs?.length) {
    return {};
  }

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

  throw new Error(
    `Could not find job outputs for keys: ${declaredOutputs.join(', ')}`,
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

    const jobs = await client.listRunJobs(run.id);
    const outputs = collectJobOutputs(jobs, stage.outputs);

    context = mergeContext(context, stage.id, outputs) as Record<
      string,
      Record<string, string>
    >;

    results.push({ stageId: stage.id, runId: run.id, outputs });
  }

  return results;
}
