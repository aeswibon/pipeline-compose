import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { groupStagesIntoWaves } from './stage-waves.js';
import { evaluateExpression, mergeContext } from '../lib/expressions.js';
import type { ResolvedPipeline, ResolvedStage } from './parser.js';

export interface LocalStageResult {
  id: string;
  workflow: string;
  repo?: string;
  status: 'success' | 'failure' | 'skipped';
  outputs: Record<string, string>;
  durationMs: number;
}

export interface LocalRunResult {
  stages: LocalStageResult[];
  success: boolean;
}

interface LocalRunOpts {
  repoRoot: string;
  workspace: string;
  actBinary: string;
  artifactDir: string;
  containerImage: string;
}

function resolveRepoDir(stage: ResolvedStage, opts: LocalRunOpts): string {
  return stage.repo
    ? path.join(opts.workspace, stage.repo)
    : opts.repoRoot;
}

function resolveInputValue(value: string, ctx: Record<string, Record<string, string>>): string {
  return value.replace(
    /\$\{\{\s*context\.([a-z0-9-]+)\.([a-z0-9_]+)\s*\}\}/gi,
    (_, stageId, key) => ctx[stageId]?.[key] ?? '',
  );
}

function resolveStageInputs(
  inputs: Record<string, string> | undefined,
  ctx: Record<string, Record<string, string>>,
): Record<string, string> {
  if (!inputs) return {};
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(inputs)) {
    resolved[key] = resolveInputValue(value, ctx);
  }
  return resolved;
}

function readArtifactOutput(artifactDir: string, stageId: string): Record<string, string> | null {
  const artifactZip = path.join(artifactDir, `pipeline-compose-${stageId}.zip`);
  if (!fs.existsSync(artifactZip)) return null;
  const extractDir = path.join(artifactDir, `.extract-${stageId}`);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  const unzipResult = spawnSync('unzip', ['-o', artifactZip, '-d', extractDir], { stdio: 'pipe' });
  if (unzipResult.status !== 0) return null;
  const outputsPath = path.join(extractDir, 'pipeline-compose', 'outputs.json');
  if (!fs.existsSync(outputsPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(outputsPath, 'utf8')) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch { /* malformed */ }
  return null;
}

function checkCommand(cmd: string, hint: string): void {
  const result = spawnSync('which', [cmd], { stdio: 'pipe' });
  if (result.status !== 0) throw new Error(`${cmd} is required but not found. ${hint}`);
}

function checkWhen(stage: ResolvedStage, context: Record<string, Record<string, string>>): boolean {
  if (!stage.when) return true;
  return evaluateExpression(stage.when, {
    github: {},
    context: context as unknown as Record<string, unknown>,
  });
}

function runActStage(
  stage: ResolvedStage,
  context: Record<string, Record<string, string>>,
  opts: LocalRunOpts,
): LocalStageResult {
  const startTime = Date.now();
  const repoDir = resolveRepoDir(stage, opts);
  const workflowPath = stage.workflow ?? stage.pipeline_file;
  const workflowFile = workflowPath ? path.join(repoDir, workflowPath) : null;

  if (!workflowFile || !fs.existsSync(workflowFile)) {
    return {
      id: stage.id,
      workflow: workflowPath ?? 'unknown',
      repo: stage.repo,
      status: 'failure',
      outputs: {},
      durationMs: Date.now() - startTime,
    };
  }

  if (!checkWhen(stage, context)) {
    return { id: stage.id, workflow: workflowPath ?? '', repo: stage.repo, status: 'skipped', outputs: {}, durationMs: 0 };
  }

  const resolvedInputs = resolveStageInputs(stage.inputs, context);
  const eventJson = JSON.stringify({ inputs: resolvedInputs });
  fs.mkdirSync(opts.artifactDir, { recursive: true });
  const eventFile = path.join(opts.artifactDir, `.event-${stage.id}.json`);
  fs.writeFileSync(eventFile, eventJson);

  const proc = spawnSync(opts.actBinary, [
    'workflow_dispatch',
    '-W', workflowFile,
    '-e', eventFile,
    '-P', `ubuntu-latest=${opts.containerImage}`,
    '--artifact-server-path', opts.artifactDir,
    '--no-reuse-container',
  ], {
    cwd: repoDir,
    stdio: 'pipe',
    timeout: 600_000,
  });

  const durationMs = Date.now() - startTime;
  fs.rmSync(eventFile, { force: true });

  if (proc.status !== 0) {
    const stderr = proc.stderr?.toString().trim() ?? '';
    console.error(`  act failed for stage "${stage.id}": ${stderr || 'exit code ' + proc.status}`);
    return { id: stage.id, workflow: workflowPath ?? '', repo: stage.repo, status: 'failure', outputs: {}, durationMs };
  }

  const outputs = readArtifactOutput(opts.artifactDir, stage.id) ?? {};
  return { id: stage.id, workflow: workflowPath ?? '', repo: stage.repo, status: 'success', outputs, durationMs };
}

function resolveContextRefs(cmd: string, context: Record<string, Record<string, string>>): string {
  return cmd.replace(
    /\$\{\{\s*context\.([a-z0-9-]+)\.([a-z0-9_]+)\s*\}\}/gi,
    (_, stageId, key) => context[stageId]?.[key] ?? '',
  );
}

function runShellStage(
  stage: ResolvedStage,
  context: Record<string, Record<string, string>>,
  opts: LocalRunOpts,
): LocalStageResult {
  const startTime = Date.now();
  const runCmd = stage.run!;

  if (!checkWhen(stage, context)) {
    return { id: stage.id, workflow: runCmd, repo: stage.repo, status: 'skipped', outputs: {}, durationMs: 0 };
  }

  const resolvedCmd = resolveContextRefs(runCmd, context);
  const outputsPath = path.join(opts.artifactDir, `${stage.id}-outputs.json`);
  fs.mkdirSync(opts.artifactDir, { recursive: true });

  const proc = spawnSync('/bin/sh', ['-c', resolvedCmd], {
    cwd: opts.repoRoot,
    stdio: 'inherit',
    timeout: 600_000,
    env: {
      ...process.env,
      PIPELINE_COMPOSE_OUTPUTS: outputsPath,
      PIPELINE_COMPOSE_STAGE_ID: stage.id,
    },
  });

  const durationMs = Date.now() - startTime;
  const outputs: Record<string, string> = {};

  if (proc.status === 0 && fs.existsSync(outputsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(outputsPath, 'utf8')) as Record<string, string>;
      if (typeof parsed === 'object' && parsed !== null) {
        Object.assign(outputs, parsed);
      }
    } catch { /* malformed outputs */ }
    fs.rmSync(outputsPath, { force: true });
  }

  return {
    id: stage.id,
    workflow: runCmd,
    repo: stage.repo,
    status: proc.status === 0 ? 'success' : 'failure',
    outputs,
    durationMs,
  };
}

export function formatLocalRunResult(result: LocalRunResult): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  pipeline-compose local — results');
  lines.push('  ────────────────────────────────');
  lines.push('');
  for (const stage of result.stages) {
    const icon = stage.status === 'success' ? ' ✓'
      : stage.status === 'skipped' ? ' −'
      : ' ✗';
    lines.push(`  ${icon}  ${stage.id}`);
    lines.push(`       action: ${stage.workflow}`);
    if (stage.repo) lines.push(`       repo: ${stage.repo}`);
    lines.push(`       status: ${stage.status}`);
    lines.push(`       duration: ${formatDuration(stage.durationMs)}`);
    const keys = Object.keys(stage.outputs);
    if (keys.length > 0) {
      lines.push(`       outputs: ${keys.join(', ')}`);
    }
    lines.push('');
  }
  const passed = result.stages.filter((s) => s.status === 'success').length;
  const failed = result.stages.filter((s) => s.status === 'failure').length;
  const skipped = result.stages.filter((s) => s.status === 'skipped').length;
  lines.push(`  Result: ${result.success ? 'PASS' : 'FAIL'}  (${passed} passed, ${failed} failed, ${skipped} skipped)`);
  return lines.join('\n');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s % 60}s`;
}

export function runPipelineLocal(
  pipeline: ResolvedPipeline,
  repoRoot: string,
  workspace: string,
  actBinary: string,
  artifactDir: string,
  containerImage: string,
): LocalRunResult {
  const opts: LocalRunOpts = { repoRoot, workspace, actBinary, artifactDir, containerImage };

  fs.mkdirSync(opts.artifactDir, { recursive: true });

  const needsAct = pipeline.stages.some((s) => !s.run);
  const needsUnzip = pipeline.stages.some((s) => !s.run);

  if (needsAct) {
    checkCommand(opts.actBinary, 'Install it via: brew install act  (or https://github.com/nektos/act)');
  }
  if (needsUnzip) {
    checkCommand('unzip', 'Install via: brew install unzip');
  }

  const waves = groupStagesIntoWaves(pipeline.stages);
  const results: LocalStageResult[] = [];
  let context: Record<string, Record<string, string>> = {};
  let success = true;

  for (const wave of waves) {
    for (const stage of wave) {
      const result = stage.run
        ? runShellStage(stage, context, opts)
        : runActStage(stage, context, opts);
      results.push(result);
      if (result.status === 'success' && Object.keys(result.outputs).length > 0) {
        context = mergeContext(context, stage.id, result.outputs) as Record<string, Record<string, string>>;
      }
      if (result.status === 'failure') {
        success = false;
      }
    }
    if (!success) break;
  }

  return { stages: results, success };
}
