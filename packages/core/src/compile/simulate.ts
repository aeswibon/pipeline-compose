import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { ResolvedPipeline, ResolvedStage } from './parser.js';
import { evaluateExpression, mergeContext } from '../lib/expressions.js';
import { groupStagesIntoWaves } from './stage-waves.js';
import { resolveSubPipeline } from './sub-pipeline.js';
import {
  canReuseStage,
  stageFingerprint,
  type RerunState,
} from '../lib/smart-rerun.js';

export type SimulateStageStatus = 'run' | 'skip' | 'blocked';

export type SimulateRerunAction = 'reuse' | 'dispatch' | 'n/a';

export interface SimulateStageResult {
  id: string;
  status: SimulateStageStatus;
  workflow?: string;
  pipeline_file?: string;
  repo?: string;
  reason?: string;
  /** 1-based DAG wave (parallel stages share a wave). */
  wave: number;
  /** Smart rerun prediction when `--rerun-state` is provided and `smart_rerun: true`. */
  rerun?: SimulateRerunAction;
}

export interface SimulateSmartRerunOptions {
  previousState: RerunState;
  ref?: string;
  /** Simulated workflow attempt (must be > 1 to evaluate reuse). Default 2. */
  runAttempt?: number;
}

export interface SimulatePipelineOptions {
  github?: Record<string, unknown>;
  repoRoot?: string;
  smartRerun?: SimulateSmartRerunOptions;
}

function resolveStageInputs(
  inputs: Record<string, string> | undefined,
  context: Record<string, Record<string, string>>,
): Record<string, string> {
  if (!inputs) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => [
      key,
      value.replace(
        /\$\{\{\s*context\.([a-z0-9-]+)\.([a-z0-9_]+)\s*\}\}/gi,
        (_, stageId, outputKey) => context[stageId]?.[outputKey] ?? '',
      ),
    ]),
  );
}

// ponytail: same-repo file digest only; cross-repo Contents API omitted in simulate
function workflowDigestForSimulate(
  stage: ResolvedStage,
  repoRoot: string | undefined,
): string | undefined {
  if (!repoRoot) {
    return undefined;
  }
  const contentPath = stage.workflow ?? stage.pipeline_file;
  if (!contentPath) {
    return undefined;
  }
  try {
    const content = fs.readFileSync(path.join(repoRoot, contentPath), 'utf8');
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch {
    return undefined;
  }
}

function smartRerunEnabled(
  pipeline: ResolvedPipeline,
  options: SimulatePipelineOptions,
): boolean {
  return Boolean(
    pipeline.smart_rerun &&
      options.smartRerun &&
      (options.smartRerun.runAttempt ?? 2) > 1,
  );
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
  pipeline: ResolvedPipeline,
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
  const annotateRerun = (result: SimulateStageResult): SimulateStageResult =>
    smartRerunEnabled(pipeline, options)
      ? { ...result, rerun: result.status === 'run' ? result.rerun : 'n/a' }
      : result;

  if (hasSkippedDependency(stage, skipped)) {
    skipped.add(stage.id);
    return {
      result: annotateRerun({ ...base, status: 'blocked', reason: 'upstream stage skipped' }),
      nextContext: context,
    };
  }

  if (stage.when && !evaluateExpression(stage.when, { github, context })) {
    skipped.add(stage.id);
    return {
      result: annotateRerun({ ...base, status: 'skip', reason: `when: ${stage.when}` }),
      nextContext: context,
    };
  }

  const missing = missingRequiredContext(stage, context);
  if (missing) {
    skipped.add(stage.id);
    return {
      result: annotateRerun({
        ...base,
        status: 'blocked',
        reason: `missing context.${missing}`,
      }),
      nextContext: context,
    };
  }

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
          result: annotateRerun({
            ...base,
            status: 'blocked',
            reason: `sub-pipeline ${failed.id} ${failed.status}`,
          }),
          nextContext: context,
        };
      }
    } catch (error) {
      skipped.add(stage.id);
      return {
        result: annotateRerun({
          ...base,
          status: 'blocked',
          reason: error instanceof Error ? error.message : 'invalid sub-pipeline',
        }),
        nextContext: context,
      };
    }
  }

  let rerun: SimulateRerunAction | undefined;
  let outputValues: Record<string, string> | undefined;

  if (smartRerunEnabled(pipeline, options)) {
    const cfg = options.smartRerun!;
    const ref = cfg.ref ?? String(github.ref ?? 'refs/heads/master');
    const inputs = resolveStageInputs(stage.inputs, context);
    const fingerprint = stageFingerprint(
      stage,
      inputs,
      ref,
      workflowDigestForSimulate(stage, options.repoRoot),
    );
    const previous = cfg.previousState.stages[stage.id];
    if (canReuseStage(previous, fingerprint, stage.outputs)) {
      rerun = 'reuse';
      outputValues = previous!.outputs;
    } else {
      rerun = 'dispatch';
    }
  }

  let nextContext = context;
  if (stage.outputs?.length) {
    const values = Object.fromEntries(
      stage.outputs.map((key) => [key, outputValues?.[key] ?? '']),
    );
    nextContext = mergeContext(context, stage.id, values) as Record<
      string,
      Record<string, string>
    >;
  }

  return {
    result: annotateRerun({ ...base, status: 'run', rerun }),
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
        pipeline,
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
  const showRerun = results.some((stage) => stage.rerun != null);

  for (const stage of results) {
    if (stage.wave !== currentWave) {
      currentWave = stage.wave;
      lines.push(`  Wave ${currentWave}`);
    }
    const target = stage.repo
      ? `${stage.repo} → ${stage.workflow ?? stage.pipeline_file}`
      : (stage.workflow ?? stage.pipeline_file ?? stage.id);
    const suffix = stage.reason ? ` — ${stage.reason}` : '';
    const rerunCol = showRerun ? ` ${(stage.rerun ?? '').padEnd(8)}` : '';
    lines.push(
      `    ${stage.status.padEnd(7)}${rerunCol} ${stage.id} → ${target}${suffix}`,
    );
  }

  return lines.join('\n');
}
