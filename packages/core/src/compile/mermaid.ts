import type { ResolvedPipeline, ResolvedStage } from './parser.js';
import { resolveStageGroup } from './parser.js';
import type { ValidationIssue } from './validate-report.js';

export interface RenderPipelineMermaidOptions {
  issues?: ValidationIssue[];
}

const STAGE_IN_MESSAGE = /(?:Stage|stage) "([^"]+)"/;

const ERROR_SUMMARY_BY_CODE: Record<string, string> = {
  'workflow.missing': 'missing workflow file',
  'stage.repo-invalid': 'invalid repo slug',
  'group.path-prefix': 'group/path mismatch',
  'export.missing': 'missing export step',
  'export.manual-upload-deprecated': 'deprecated manual export',
  'uses.monorepo-subpath-deprecated': 'legacy action path',
  'uses.master-pin-deprecated': '@master pin',
  'pipeline.v1-deprecated': 'schema v1',
};

function mermaidNodeId(stageId: string): string {
  return stageId.replace(/[^a-zA-Z0-9_]/g, '_');
}

function stageIdFromIssue(issue: ValidationIssue): string | undefined {
  const match = issue.message.match(STAGE_IN_MESSAGE);
  return match?.[1];
}

function issuesForStage(issues: ValidationIssue[], stageId: string): ValidationIssue[] {
  return issues.filter((issue) => stageIdFromIssue(issue) === stageId);
}

function errorStageIds(issues: ValidationIssue[]): Set<string> {
  const ids = new Set<string>();
  for (const issue of issues) {
    if (issue.level !== 'error') {
      continue;
    }
    const stageId = stageIdFromIssue(issue);
    if (stageId) {
      ids.add(stageId);
    }
  }
  return ids;
}

function blockedStageIds(
  pipeline: ResolvedPipeline,
  errorIds: Set<string>,
): Set<string> {
  const blocked = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const stage of pipeline.stages) {
      if (errorIds.has(stage.id) || blocked.has(stage.id)) {
        continue;
      }
      for (const dep of stage.needs ?? []) {
        if (errorIds.has(dep) || blocked.has(dep)) {
          blocked.add(stage.id);
          changed = true;
          break;
        }
      }
    }
  }

  return blocked;
}

function summarizeStageErrors(issues: ValidationIssue[]): string {
  const errors = issues.filter((issue) => issue.level === 'error');
  if (errors.length === 0) {
    return '';
  }
  const first = errors[0];
  return ERROR_SUMMARY_BY_CODE[first.code] ?? first.code;
}

function escapeMermaidLabel(text: string): string {
  return text.replace(/"/g, '\\"');
}

function stageNodeLabel(stage: ResolvedStage, pipeline: ResolvedPipeline): string {
  const group = stage.resolvedGroup ?? resolveStageGroup(stage, pipeline.group);
  const parts = [stage.id];
  if (group) {
    parts.push(`(${group})`);
  }
  if (stage.repo) {
    parts.push(`[${stage.repo}]`);
  }
  return parts.join(' ');
}

export function renderPipelineMermaid(
  pipeline: ResolvedPipeline,
  options: RenderPipelineMermaidOptions = {},
): string {
  const issues = options.issues ?? [];
  const errorsByStage = errorStageIds(issues);
  const blockedByStage = blockedStageIds(pipeline, errorsByStage);
  const lines: string[] = ['flowchart TD'];
  const stageIds = new Set(pipeline.stages.map((stage) => stage.id));
  let hasErrorStyle = false;
  let hasBlockedStyle = false;

  for (const stage of pipeline.stages) {
    const nodeId = mermaidNodeId(stage.id);
    let label = stageNodeLabel(stage, pipeline);
    let styleClass = '';

    if (errorsByStage.has(stage.id)) {
      const summary = summarizeStageErrors(issuesForStage(issues, stage.id));
      label = summary ? `${label}<br/>❌ ${summary}` : `${label}<br/>❌ error`;
      styleClass = ':::error';
      hasErrorStyle = true;
    } else if (blockedByStage.has(stage.id)) {
      label = `${label}<br/>⚠ blocked upstream`;
      styleClass = ':::blocked';
      hasBlockedStyle = true;
    }

    lines.push(`  ${nodeId}["${escapeMermaidLabel(label)}"]${styleClass}`);
  }

  for (const stage of pipeline.stages) {
    const target = mermaidNodeId(stage.id);
    for (const dep of stage.needs ?? []) {
      if (!stageIds.has(dep)) {
        continue;
      }
      lines.push(`  ${mermaidNodeId(dep)} --> ${target}`);
    }
  }

  if (pipeline.stages.every((stage) => (stage.needs ?? []).length === 0)) {
    for (let i = 1; i < pipeline.stages.length; i++) {
      const prev = pipeline.stages[i - 1];
      const current = pipeline.stages[i];
      lines.push(`  ${mermaidNodeId(prev.id)} -.-> ${mermaidNodeId(current.id)}`);
    }
    lines.push('');
    lines.push('  %% Dotted edges show file order only — add explicit needs: in pipeline.yml');
  }

  if (hasErrorStyle || hasBlockedStyle) {
    lines.push('');
    if (hasErrorStyle) {
      lines.push(
        '  classDef error fill:#ffebe9,stroke:#cf222e,stroke-width:2px,color:#1f2328',
      );
    }
    if (hasBlockedStyle) {
      lines.push(
        '  classDef blocked fill:#fff8c5,stroke:#9a6700,stroke-width:2px,color:#1f2328',
      );
    }
  }

  return lines.join('\n');
}
