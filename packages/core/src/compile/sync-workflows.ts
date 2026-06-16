import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ResolvedPipeline } from './parser.js';

export interface WorkflowSyncMapping {
  from: string;
  to: string;
}

export interface WorkflowSyncPlan {
  mappings: WorkflowSyncMapping[];
}

export interface WorkflowSyncResult {
  copied: string[];
  skipped: string[];
  missingSources: string[];
}

export interface WorkflowSyncPreview {
  create: string[];
  update: string[];
  upToDate: string[];
  missingSources: string[];
}

function defaultSourcePath(
  repoRoot: string,
  group: string | undefined,
  stageId: string,
): string {
  const segment = group ?? 'ungrouped';
  return path.join(repoRoot, 'workflows', segment, `${stageId}.yml`);
}

export function loadSyncConfig(repoRoot: string): WorkflowSyncMapping[] {
  const configPath = path.join(repoRoot, 'workflows', 'sync.yml');
  if (!fs.existsSync(configPath)) {
    return [];
  }
  const doc = parseYaml(fs.readFileSync(configPath, 'utf8')) as {
    mappings?: WorkflowSyncMapping[];
  };
  return doc.mappings ?? [];
}

export function buildSyncPlan(
  pipeline: ResolvedPipeline,
  repoRoot: string,
): WorkflowSyncPlan {
  const mappings: WorkflowSyncMapping[] = [];
  const seenTargets = new Set<string>();

  for (const override of loadSyncConfig(repoRoot)) {
    const target = path.normalize(path.resolve(repoRoot, override.to));
    if (!seenTargets.has(target)) {
      mappings.push({
        from: override.from,
        to: override.to,
      });
      seenTargets.add(target);
    }
  }

  for (const stage of pipeline.stages) {
    const workflow = stage.workflow;
    if (!workflow) {
      continue;
    }
    const target = path.normalize(path.resolve(repoRoot, workflow));
    if (seenTargets.has(target)) {
      continue;
    }
    const source = defaultSourcePath(
      repoRoot,
      stage.resolvedGroup ?? stage.group,
      stage.id,
    );
    mappings.push({
      from: path.relative(repoRoot, source),
      to: workflow,
    });
    seenTargets.add(target);
  }

  return { mappings };
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function previewWorkflowSync(
  plan: WorkflowSyncPlan,
  repoRoot: string,
): WorkflowSyncPreview {
  const create: string[] = [];
  const update: string[] = [];
  const upToDate: string[] = [];
  const missingSources: string[] = [];

  for (const mapping of plan.mappings) {
    const sourcePath = path.resolve(repoRoot, mapping.from);
    const targetPath = path.resolve(repoRoot, mapping.to);

    if (!fs.existsSync(sourcePath)) {
      missingSources.push(mapping.from);
      continue;
    }

    const sourceText = fs.readFileSync(sourcePath, 'utf8');
    if (!fs.existsSync(targetPath)) {
      create.push(mapping.to);
      continue;
    }

    const targetText = fs.readFileSync(targetPath, 'utf8');
    if (targetText === sourceText) {
      upToDate.push(mapping.to);
    } else {
      update.push(mapping.to);
    }
  }

  return { create, update, upToDate, missingSources };
}

export function formatWorkflowSyncPreview(preview: WorkflowSyncPreview): string {
  const lines: string[] = [];
  for (const target of preview.create) {
    lines.push(`create ${target}`);
  }
  for (const target of preview.update) {
    lines.push(`update ${target}`);
  }
  for (const target of preview.upToDate) {
    lines.push(`up-to-date ${target}`);
  }
  for (const source of preview.missingSources) {
    lines.push(`missing-source ${source}`);
  }
  if (lines.length === 0) {
    lines.push('No workflow sync changes.');
  }
  return lines.join('\n');
}

export function runWorkflowSync(
  plan: WorkflowSyncPlan,
  repoRoot: string,
  check = false,
): WorkflowSyncResult {
  const copied: string[] = [];
  const skipped: string[] = [];
  const missingSources: string[] = [];

  for (const mapping of plan.mappings) {
    const sourcePath = path.resolve(repoRoot, mapping.from);
    const targetPath = path.resolve(repoRoot, mapping.to);

    if (!fs.existsSync(sourcePath)) {
      missingSources.push(mapping.from);
      continue;
    }

    const sourceText = fs.readFileSync(sourcePath, 'utf8');
    if (fs.existsSync(targetPath)) {
      const targetText = fs.readFileSync(targetPath, 'utf8');
      if (targetText === sourceText) {
        skipped.push(mapping.to);
        continue;
      }
      if (check) {
        throw new Error(`Stale workflow target: ${mapping.to}`);
      }
    } else if (check) {
      throw new Error(`Missing workflow target: ${mapping.to}`);
    }

    if (!check) {
      ensureParentDir(targetPath);
      fs.writeFileSync(targetPath, sourceText);
      copied.push(mapping.to);
    }
  }

  return { copied, skipped, missingSources };
}
