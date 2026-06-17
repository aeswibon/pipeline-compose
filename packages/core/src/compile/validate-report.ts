import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PipelineDocument, ResolvedPipeline, ResolvedStage } from './parser.js';
import { isPipelineV2, resolveStageGroup } from './parser.js';
import { GLOBAL_LOCK_DIR } from '../lib/global-lock.js';
import { parseRepoSlug } from '../lib/expressions.js';
import { parseContextInputRefs } from '../lib/context-refs.js';
import { collectContextSchemaIssues } from '../lib/context-schema.js';
import { collectDeprecationIssues } from './deprecations.js';
import {
  isSubPipelineStage,
  listWorkflowPaths,
  nestedDeclaredOutputs,
  resolveSubPipeline,
} from './sub-pipeline.js';

export type ValidationIssueLevel = 'warn' | 'error';

export interface ValidationIssue {
  level: ValidationIssueLevel;
  code: string;
  message: string;
}

export interface ValidateReportOptions {
  repoRoot?: string;
  workflows?: boolean;
  strict?: boolean;
  defaultRepo?: string;
  repoTokenSlugs?: Set<string>;
  extraIssues?: ValidationIssue[];
  /** Source documents for catalog_from and similar root-level checks. */
  documents?: PipelineDocument[];
}

export interface ValidateReport {
  pipeline: ResolvedPipeline;
  issues: ValidationIssue[];
}

function workflowBasename(workflowPath: string): string {
  return path.basename(workflowPath.replace(/\\/g, '/'));
}

export function workflowMatchesGroupConvention(
  workflowPath: string,
  group: string | undefined,
  stageId?: string,
): boolean {
  if (!group) {
    return true;
  }
  const stem = workflowBasename(workflowPath).replace(/\.(ya?ml)$/i, '');
  if (stageId && stem === stageId) {
    return true;
  }
  if (stem.startsWith(`${group}-`)) {
    return true;
  }
  if (stem.startsWith('stage-')) {
    return true;
  }
  if (stem.includes(group)) {
    return true;
  }
  return false;
}

export function collectPipelineIssues(
  pipeline: ResolvedPipeline,
  options: ValidateReportOptions = {},
): ValidationIssue[] {
  const repoRoot = options.repoRoot;
  const issues: ValidationIssue[] = [];
  const grouped = new Set<string>();
  let ungrouped = 0;

  for (const stage of pipeline.stages) {
    const group = stage.resolvedGroup ?? resolveStageGroup(stage);
    if (group) {
      grouped.add(group);
    } else {
      ungrouped += 1;
    }

    if (group && stage.workflow && !workflowMatchesGroupConvention(stage.workflow, group, stage.id)) {
      issues.push({
        level: 'warn',
        code: 'group.path-prefix',
        message: `Stage "${stage.id}" group "${group}" does not match workflow path ${stage.workflow} (expected stage id, ${group}-*, stage-*, or name containing "${group}")`,
      });
    }

    if (isSubPipelineStage(stage)) {
      if (!repoRoot) {
        continue;
      }
      try {
        const nested = resolveSubPipeline(repoRoot, stage.pipeline_file!, stage.pipeline);
        const nestedOutputs = nestedDeclaredOutputs(nested);
        for (const outputKey of stage.outputs ?? []) {
          if (!nestedOutputs.has(outputKey)) {
            issues.push({
              level: 'error',
              code: 'subpipeline.unknown-output',
              message: `Sub-pipeline stage "${stage.id}" declares output "${outputKey}" but nested pipeline does not produce it`,
            });
          }
        }
      } catch (error) {
        issues.push({
          level: 'error',
          code: 'subpipeline.invalid',
          message:
            error instanceof Error
              ? error.message
              : `Invalid sub-pipeline for stage "${stage.id}"`,
        });
      }
      continue;
    }

    if (repoRoot && stage.workflow) {
      const workflowPath = path.resolve(repoRoot, stage.workflow);
      if (!fs.existsSync(workflowPath)) {
        issues.push({
          level: 'error',
          code: 'workflow.missing',
          message: `Missing workflow file for stage "${stage.id}": ${stage.workflow}`,
        });
      }
    }

    if (stage.repo) {
      try {
        parseRepoSlug(stage.repo);
        issues.push({
          level: 'warn',
          code: 'stage.cross-repo',
          message: `Stage "${stage.id}" dispatches in ${stage.repo}; github_token must have actions:write on that repository`,
        });
        if (
          options.defaultRepo &&
          stage.repo !== options.defaultRepo &&
          !options.repoTokenSlugs?.has(stage.repo)
        ) {
          issues.push({
            level: 'warn',
            code: 'stage.cross-repo-token',
            message: `Stage "${stage.id}" targets ${stage.repo}; add it to repo_tokens_json (or use github_app_id/github_app_private_key, or --repo-tokens-file for local validate)`,
          });
        }
      } catch {
        issues.push({
          level: 'error',
          code: 'stage.repo-invalid',
          message: `Stage "${stage.id}" has invalid repo slug "${stage.repo}" (expected owner/repo)`,
        });
      }
    }
  }

  if (grouped.size > 0 && ungrouped > 0) {
    issues.push({
      level: 'warn',
      code: 'group.mixed',
      message: `${ungrouped} stage(s) have no resolved group while others are grouped`,
    });
  }

  return issues;
}

export function collectNeedsIssues(stages: ResolvedPipeline['stages']): ValidationIssue[] {
  const ids = new Set(stages.map((stage) => stage.id));
  const issues: ValidationIssue[] = [];

  for (const stage of stages) {
    for (const dep of stage.needs ?? []) {
      if (!ids.has(dep)) {
        issues.push({
          level: 'error',
          code: 'needs.unknown',
          message: `Stage "${stage.id}" needs unknown stage "${dep}"`,
        });
      }
    }
  }

  return issues;
}

export function collectContextIssues(stages: ResolvedPipeline['stages']): ValidationIssue[] {
  const ids = new Set(stages.map((stage) => stage.id));
  const outputsByStage = new Map(
    stages.map((stage) => [stage.id, new Set(stage.outputs ?? [])]),
  );
  const issues: ValidationIssue[] = [];

  for (const stage of stages) {
    if (!stage.inputs) {
      continue;
    }
    for (const value of Object.values(stage.inputs)) {
      for (const { stageId, outputKey } of parseContextInputRefs(value)) {
        if (!ids.has(stageId)) {
          issues.push({
            level: 'error',
            code: 'context.unknown-stage',
            message: `Stage "${stage.id}" references context.${stageId}.${outputKey} but no stage "${stageId}" exists`,
          });
        } else if (!outputsByStage.get(stageId)?.has(outputKey)) {
          issues.push({
            level: 'error',
            code: 'context.unknown-output',
            message: `Stage "${stage.id}" references context.${stageId}.${outputKey} but stage "${stageId}" does not declare output "${outputKey}"`,
          });
        }
      }
    }
  }

  return issues;
}

export function collectConcurrencyIssues(
  concurrency: ResolvedPipeline['concurrency'],
  defaultRepo?: string,
): ValidationIssue[] {
  if (!concurrency?.global) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  const lockRepo = concurrency.lock_repo ?? defaultRepo;
  if (!lockRepo) {
    issues.push({
      level: 'error',
      code: 'concurrency.lock-repo-missing',
      message: 'Global concurrency requires lock_repo or a default entry repository',
    });
    return issues;
  }
  try {
    parseRepoSlug(lockRepo);
  } catch {
    issues.push({
      level: 'error',
      code: 'concurrency.lock-repo-invalid',
      message: `Invalid lock_repo slug "${lockRepo}" (expected owner/repo)`,
    });
  }
  issues.push({
    level: 'warn',
    code: 'concurrency.global',
    message: `Global concurrency stores locks in ${lockRepo} (${GLOBAL_LOCK_DIR}/); token needs contents:read and contents:write`,
  });
  return issues;
}

export function collectCatalogFromIssues(doc: PipelineDocument): ValidationIssue[] {
  if (!isPipelineV2(doc) || !doc.catalog_from) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  try {
    parseRepoSlug(doc.catalog_from.repo);
  } catch {
    issues.push({
      level: 'error',
      code: 'catalog-from.invalid-repo',
      message: `catalog_from.repo is invalid: "${doc.catalog_from.repo}"`,
    });
  }
  if (!doc.catalog_from.path?.trim()) {
    issues.push({
      level: 'error',
      code: 'catalog-from.invalid-path',
      message: 'catalog_from.path must be a non-empty repository file path',
    });
  }
  issues.push({
    level: 'warn',
    code: 'catalog-from.remote',
    message: `Pipeline loads catalog from ${doc.catalog_from.repo}:${doc.catalog_from.path} at run time (local catalog overrides remote keys)`,
  });
  return issues;
}

export function findOrphanWorkflows(
  repoRoot: string,
  pipeline: ResolvedPipeline,
): string[] {
  const root = path.resolve(repoRoot);
  const workflowsDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    return [];
  }

  const referenced = new Set<string>();
  for (const stage of pipeline.stages) {
    if (stage.workflow) {
      referenced.add(path.normalize(path.resolve(root, stage.workflow)));
    }
    if (isSubPipelineStage(stage) && fs.existsSync(path.resolve(root, stage.pipeline_file!))) {
      try {
        const nested = resolveSubPipeline(root, stage.pipeline_file!, stage.pipeline);
        for (const workflowPath of listWorkflowPaths(nested, root)) {
          referenced.add(workflowPath);
        }
      } catch {
        // resolveSubPipeline issues are reported elsewhere
      }
    }
  }
  for (const workflow of pipeline.companion_workflows ?? []) {
    referenced.add(path.normalize(path.resolve(root, workflow)));
  }

  const entries = fs.readdirSync(workflowsDir, { withFileTypes: true });
  const orphans: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.endsWith('.yml') && !entry.name.endsWith('.yaml')) {
      continue;
    }
    const fullPath = path.normalize(path.join(workflowsDir, entry.name));
    if (!referenced.has(fullPath)) {
      orphans.push(path.relative(root, fullPath));
    }
  }

  return orphans.sort();
}

export function buildValidateReport(
  pipeline: ResolvedPipeline,
  options: ValidateReportOptions = {},
): ValidateReport {
  const issues = collectPipelineIssues(pipeline, options);
  if (options.extraIssues?.length) {
    issues.push(...options.extraIssues);
  }
  issues.push(...collectNeedsIssues(pipeline.stages));
  issues.push(...collectContextIssues(pipeline.stages));
  issues.push(...collectContextSchemaIssues(pipeline));
  issues.push(...collectConcurrencyIssues(pipeline.concurrency, options.defaultRepo));
  for (const doc of options.documents ?? []) {
    issues.push(...collectCatalogFromIssues(doc));
  }

  if (options.repoRoot) {
    issues.push(...collectDeprecationIssues(pipeline, options.repoRoot));
  }

  if (options.workflows && options.repoRoot) {
    for (const orphan of findOrphanWorkflows(options.repoRoot, pipeline)) {
      issues.push({
        level: 'warn',
        code: 'workflow.orphan',
        message: `Workflow not referenced by any stage: ${orphan}`,
      });
    }
  }

  if (options.strict) {
    for (const issue of issues) {
      // ponytail: informational global-lock reminder; not a graph defect
      if (issue.level === 'warn' && issue.code !== 'concurrency.global') {
        issue.level = 'error';
      }
    }
  }

  return { pipeline, issues };
}

export function formatPipelineTree(pipeline: ResolvedPipeline): string {
  const lines: string[] = [];
  lines.push(`Pipeline: ${pipeline.name} (${pipeline.stages.length} stage(s))`);
  if (pipeline.group) {
    lines.push(`Default group: ${pipeline.group}`);
  }

  const groups = new Map<string, ResolvedStage[]>();
  const ungrouped: ResolvedStage[] = [];

  for (const stage of pipeline.stages) {
    const group = stage.resolvedGroup ?? resolveStageGroup(stage, pipeline.group);
    if (group) {
      const bucket = groups.get(group) ?? [];
      bucket.push(stage);
      groups.set(group, bucket);
    } else {
      ungrouped.push(stage);
    }
  }

  for (const [group, stages] of [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const description = pipeline.groups?.[group]?.description;
    lines.push('');
    lines.push(`  [${group}]${description ? ` — ${description}` : ''}`);
    for (const stage of stages) {
      const pipelineLabel = stage.pipelineKey ? ` (${stage.pipelineKey})` : '';
      lines.push(
        `    ${stage.id}${pipelineLabel} → ${stage.workflow ?? stage.pipeline_file}`,
      );
    }
  }

  if (ungrouped.length > 0) {
    lines.push('');
    lines.push('  [ungrouped]');
    for (const stage of ungrouped) {
      lines.push(`    ${stage.id} → ${stage.workflow ?? stage.pipeline_file}`);
    }
  }

  return lines.join('\n');
}

export function formatValidateReport(report: ValidateReport): string {
  const lines = [formatPipelineTree(report.pipeline)];

  if (report.issues.length > 0) {
    lines.push('');
    for (const issue of report.issues) {
      lines.push(`${issue.level}: ${issue.message}`);
    }
  } else {
    lines.push('');
    lines.push('No issues.');
  }

  return lines.join('\n');
}

export function validateReportExitCode(report: ValidateReport): number {
  return report.issues.some((issue) => issue.level === 'error') ? 1 : 0;
}

export function serializeValidateReport(
  report: ValidateReport,
  simulation?: import('./simulate.js').SimulateStageResult[],
  options?: { mermaid?: string },
): string {
  return JSON.stringify(
    {
      ok: validateReportExitCode(report) === 0,
      pipeline: {
        name: report.pipeline.name,
        group: report.pipeline.group,
        stageCount: report.pipeline.stages.length,
        stages: report.pipeline.stages.map((stage) => ({
          id: stage.id,
          workflow: stage.workflow ?? stage.pipeline_file,
          repo: stage.repo,
          group: stage.resolvedGroup ?? resolveStageGroup(stage, report.pipeline.group),
          pipelineKey: stage.pipelineKey,
        })),
      },
      ...(options?.mermaid !== undefined ? { mermaid: options.mermaid } : {}),
      ...(simulation ? { simulation } : {}),
      issues: report.issues,
    },
    null,
    2,
  );
}
