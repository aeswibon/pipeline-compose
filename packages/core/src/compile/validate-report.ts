import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ResolvedPipeline, ResolvedStage } from './parser.js';
import { resolveStageGroup } from './parser.js';
import { parseRepoSlug } from '../lib/expressions.js';
import { collectDeprecationIssues } from './deprecations.js';

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

    if (group && !workflowMatchesGroupConvention(stage.workflow, group, stage.id)) {
      issues.push({
        level: 'warn',
        code: 'group.path-prefix',
        message: `Stage "${stage.id}" group "${group}" does not match workflow path ${stage.workflow} (expected stage id, ${group}-*, stage-*, or name containing "${group}")`,
      });
    }

    if (repoRoot) {
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
            message: `Stage "${stage.id}" targets ${stage.repo}; add it to repo_tokens_json (or --repo-tokens-file for local validate)`,
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

export function findOrphanWorkflows(
  repoRoot: string,
  pipeline: ResolvedPipeline,
): string[] {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    return [];
  }

  const referenced = new Set([
    ...pipeline.stages.map((stage) =>
      path.normalize(path.resolve(repoRoot, stage.workflow)),
    ),
    ...(pipeline.companion_workflows ?? []).map((workflow) =>
      path.normalize(path.resolve(repoRoot, workflow)),
    ),
  ]);

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
      orphans.push(path.relative(repoRoot, fullPath));
    }
  }

  return orphans.sort();
}

export function buildValidateReport(
  pipeline: ResolvedPipeline,
  options: ValidateReportOptions = {},
): ValidateReport {
  const issues = collectPipelineIssues(pipeline, options);

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
      if (issue.level === 'warn') {
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
        `    ${stage.id}${pipelineLabel} → ${stage.workflow}`,
      );
    }
  }

  if (ungrouped.length > 0) {
    lines.push('');
    lines.push('  [ungrouped]');
    for (const stage of ungrouped) {
      lines.push(`    ${stage.id} → ${stage.workflow}`);
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

export function serializeValidateReport(report: ValidateReport): string {
  return JSON.stringify(
    {
      ok: validateReportExitCode(report) === 0,
      pipeline: {
        name: report.pipeline.name,
        group: report.pipeline.group,
        stageCount: report.pipeline.stages.length,
        stages: report.pipeline.stages.map((stage) => ({
          id: stage.id,
          workflow: stage.workflow,
          repo: stage.repo,
          group: stage.resolvedGroup ?? resolveStageGroup(stage, report.pipeline.group),
          pipelineKey: stage.pipelineKey,
        })),
      },
      issues: report.issues,
    },
    null,
    2,
  );
}
