import type { ResolvedPipeline, ResolvedStage } from './parser.js';
import { evaluateExpression, mergeContext } from '../lib/expressions.js';
import { sortStages } from './topo-sort.js';

export type SimulateStageStatus = 'run' | 'skip' | 'blocked';

export interface SimulateStageResult {
  id: string;
  status: SimulateStageStatus;
  workflow: string;
  repo?: string;
  reason?: string;
}

export interface SimulatePipelineOptions {
  github?: Record<string, unknown>;
}

function hasSkippedDependency(stage: ResolvedStage, skipped: Set<string>): boolean {
  return (stage.needs ?? []).some((dep) => skipped.has(dep));
}

function missingRequiredContext(
  stage: ResolvedStage,
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

function orderedStages(pipeline: ResolvedPipeline): ResolvedStage[] {
  try {
    return sortStages([...pipeline.stages]);
  } catch {
    return pipeline.stages;
  }
}

export function simulatePipeline(
  pipeline: ResolvedPipeline,
  options: SimulatePipelineOptions = {},
): SimulateStageResult[] {
  const github = options.github ?? { ref: 'refs/heads/master' };
  const skipped = new Set<string>();
  let context: Record<string, Record<string, string>> = {};
  const results: SimulateStageResult[] = [];

  for (const stage of orderedStages(pipeline)) {
    const base = {
      id: stage.id,
      workflow: stage.workflow,
      repo: stage.repo,
    };

    if (hasSkippedDependency(stage, skipped)) {
      skipped.add(stage.id);
      results.push({ ...base, status: 'blocked', reason: 'upstream stage skipped' });
      continue;
    }

    if (stage.when && !evaluateExpression(stage.when, { github, context })) {
      skipped.add(stage.id);
      results.push({ ...base, status: 'skip', reason: `when: ${stage.when}` });
      continue;
    }

    const missing = missingRequiredContext(stage, context);
    if (missing) {
      skipped.add(stage.id);
      results.push({
        ...base,
        status: 'blocked',
        reason: `missing context.${missing}`,
      });
      continue;
    }

    if (stage.outputs?.length) {
      context = mergeContext(
        context,
        stage.id,
        Object.fromEntries(stage.outputs.map((key) => [key, ''])),
      ) as Record<string, Record<string, string>>;
    }

    results.push({ ...base, status: 'run' });
  }

  return results;
}

export function formatSimulateReport(results: SimulateStageResult[]): string {
  const lines = ['Simulation (no workflows dispatched):', ''];
  for (const stage of results) {
    const target = stage.repo ? `${stage.repo} → ${stage.workflow}` : stage.workflow;
    const suffix = stage.reason ? ` — ${stage.reason}` : '';
    lines.push(`  ${stage.status.padEnd(7)} ${stage.id} → ${target}${suffix}`);
  }
  return lines.join('\n');
}
