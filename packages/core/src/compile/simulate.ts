import type { ResolvedPipeline, ResolvedStage } from './parser.js';
import { evaluateExpression, mergeContext } from '../lib/expressions.js';
import { groupStagesIntoWaves } from './stage-waves.js';
import { resolveSubPipeline } from './sub-pipeline.js';

export type SimulateStageStatus = 'run' | 'skip' | 'blocked';

export interface SimulateStageResult {
  id: string;
  status: SimulateStageStatus;
  workflow?: string;
  pipeline_file?: string;
  repo?: string;
  reason?: string;
  /** 1-based DAG wave (parallel stages share a wave). */
  wave: number;
}

export interface SimulatePipelineOptions {
  github?: Record<string, unknown>;
  repoRoot?: string;
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

function simulateStage(
  stage: ResolvedStage,
  wave: number,
  skipped: Set<string>,
  github: Record<string, unknown>,
  context: Record<string, Record<string, string>>,
  options: SimulatePipelineOptions,
): { result: SimulateStageResult; nextContext: Record<string, Record<string, string>> } {
  const base = {
    id: stage.id,
    workflow: stage.workflow,
    pipeline_file: stage.pipeline_file,
    repo: stage.repo,
    wave,
  };

  if (hasSkippedDependency(stage, skipped)) {
    skipped.add(stage.id);
    return {
      result: { ...base, status: 'blocked', reason: 'upstream stage skipped' },
      nextContext: context,
    };
  }

  if (stage.when && !evaluateExpression(stage.when, { github, context })) {
    skipped.add(stage.id);
    return {
      result: { ...base, status: 'skip', reason: `when: ${stage.when}` },
      nextContext: context,
    };
  }

  const missing = missingRequiredContext(stage, context);
  if (missing) {
    skipped.add(stage.id);
    return {
      result: {
        ...base,
        status: 'blocked',
        reason: `missing context.${missing}`,
      },
      nextContext: context,
    };
  }

  let nextContext = context;
  if (stage.pipeline_file && options.repoRoot) {
    try {
      const nested = resolveSubPipeline(options.repoRoot, stage.pipeline_file, stage.pipeline);
      const nestedResults = simulatePipeline(nested, { github, repoRoot: options.repoRoot });
      const failed = nestedResults.find(
        (row) => row.status === 'blocked' || row.status === 'skip',
      );
      if (failed) {
        skipped.add(stage.id);
        return {
          result: {
            ...base,
            status: 'blocked',
            reason: `sub-pipeline ${failed.id} ${failed.status}`,
          },
          nextContext: context,
        };
      }
    } catch (error) {
      skipped.add(stage.id);
      return {
        result: {
          ...base,
          status: 'blocked',
          reason: error instanceof Error ? error.message : 'invalid sub-pipeline',
        },
        nextContext: context,
      };
    }
  }

  if (stage.outputs?.length) {
    nextContext = mergeContext(
      context,
      stage.id,
      Object.fromEntries(stage.outputs.map((key) => [key, ''])),
    ) as Record<string, Record<string, string>>;
  }

  return {
    result: { ...base, status: 'run' },
    nextContext,
  };
}

export function simulatePipeline(
  pipeline: ResolvedPipeline,
  options: SimulatePipelineOptions = {},
): SimulateStageResult[] {
  const github = options.github ?? { ref: 'refs/heads/master' };
  const skipped = new Set<string>();
  let context: Record<string, Record<string, string>> = {};
  const results: SimulateStageResult[] = [];

  const waves = groupStagesIntoWaves(pipeline.stages);
  for (let waveIndex = 0; waveIndex < waves.length; waveIndex++) {
    const wave = waves[waveIndex];
    const waveNum = waveIndex + 1;
    for (const stage of wave) {
      const { result, nextContext } = simulateStage(
        stage,
        waveNum,
        skipped,
        github,
        context,
        options,
      );
      context = nextContext;
      results.push(result);
    }
  }

  return results;
}

export function formatSimulateReport(results: SimulateStageResult[]): string {
  const lines = ['Simulation (no workflows dispatched):', ''];
  let currentWave = 0;

  for (const stage of results) {
    if (stage.wave !== currentWave) {
      currentWave = stage.wave;
      lines.push(`  Wave ${currentWave}`);
    }
    const target = stage.repo
      ? `${stage.repo} → ${stage.workflow ?? stage.pipeline_file}`
      : (stage.workflow ?? stage.pipeline_file ?? stage.id);
    const suffix = stage.reason ? ` — ${stage.reason}` : '';
    lines.push(`    ${stage.status.padEnd(7)} ${stage.id} → ${target}${suffix}`);
  }

  return lines.join('\n');
}
