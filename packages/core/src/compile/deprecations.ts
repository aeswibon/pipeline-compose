import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ResolvedPipeline, ResolvedStage } from './parser.js';
import type { ValidationIssue } from './validate-report.js';

const MONOREPO_SUBPATH_USES =
  /uses:\s*['"]?aeswibon\/pipeline-compose\/(run|compile|eval|export|context-merge)/;

const MASTER_PIN = /uses:\s*[^\s@]+@master\b/;

const EXPORT_ACTION =
  /uses:\s*[^\n]*(?:pipeline-compose-export|\/action-export|packages\/action-export)/;

const UPLOAD_ARTIFACT = /uses:\s*actions\/upload-artifact@/;

export function artifactNameForStage(stageId: string): string {
  return `pipeline-compose-${stageId}`;
}

export function collectWorkflowFileDeprecations(
  repoRoot: string,
  relativePath: string,
): ValidationIssue[] {
  const absolutePath = path.resolve(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const issues: ValidationIssue[] = [];

  if (MONOREPO_SUBPATH_USES.test(content)) {
    issues.push({
      level: 'error',
      code: 'uses.monorepo-subpath-deprecated',
      message: `Workflow ${relativePath} uses legacy aeswibon/pipeline-compose/<action> paths; use separate action repos (e.g. aeswibon/pipeline-compose-run@v1.3.0)`,
    });
  }

  if (MASTER_PIN.test(content)) {
    issues.push({
      level: 'error',
      code: 'uses.master-pin-deprecated',
      message: `Workflow ${relativePath} pins actions at @master; use a semver tag (e.g. @v1.3.0)`,
    });
  }

  return issues;
}

export function collectStageExportDeprecations(
  repoRoot: string,
  stage: ResolvedStage,
): ValidationIssue[] {
  if (!stage.outputs || stage.outputs.length === 0) {
    return [];
  }

  const relativePath = stage.workflow;
  const absolutePath = path.resolve(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const artifactName = artifactNameForStage(stage.id);

  if (EXPORT_ACTION.test(content)) {
    return [];
  }

  const hasManualUpload =
    UPLOAD_ARTIFACT.test(content) &&
    (content.includes(artifactName) || content.includes('pipeline-compose/outputs.json'));

  if (hasManualUpload) {
    return [
      {
        level: 'error',
        code: 'export.manual-upload-deprecated',
        message: `Stage "${stage.id}" uses manual jq/upload-artifact export; use pipeline-compose-export`,
      },
    ];
  }

  return [
    {
      level: 'error',
      code: 'export.missing',
      message: `Stage "${stage.id}" declares outputs but workflow ${relativePath} has no pipeline-compose-export step`,
    },
  ];
}

export function collectDeprecationIssues(
  pipeline: ResolvedPipeline,
  repoRoot: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const scannedWorkflows = new Set<string>();

  for (const stage of pipeline.stages) {
    issues.push(...collectStageExportDeprecations(repoRoot, stage));
    if (!scannedWorkflows.has(stage.workflow)) {
      scannedWorkflows.add(stage.workflow);
      issues.push(...collectWorkflowFileDeprecations(repoRoot, stage.workflow));
    }
  }

  for (const companion of pipeline.companion_workflows ?? []) {
    if (scannedWorkflows.has(companion)) {
      continue;
    }
    scannedWorkflows.add(companion);
    issues.push(...collectWorkflowFileDeprecations(repoRoot, companion));
  }

  return issues;
}
