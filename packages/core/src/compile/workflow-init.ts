import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { sortStages } from './topo-sort.js';
import type { PipelineStage } from './parser.js';

export interface WorkflowInitCandidate {
  id: string;
  workflowPath: string;
  triggers: string[];
}

export interface WorkflowInitResult {
  candidates: WorkflowInitCandidate[];
  stages: PipelineStage[];
  skipped: string[];
  /** Workflows that dispatch to other repos via repository_dispatch (migration hints). */
  dispatchHints: string[];
}

const LOCAL_WORKFLOW_REF =
  /(?:uses:\s*|\.\/)?\.github\/workflows\/([A-Za-z0-9_.-]+)\.(ya?ml)/gi;

const EXPORT_USES_RE =
  /uses:\s*[^\n]*(?:pipeline-compose-export|\/action-export|packages\/action-export)/gi;

const REPOSITORY_DISPATCH_ACTION_RE =
  /(?:peter-evans\/repository-dispatch|actions\/github-script|gh\s+api[^\n]*dispatches)/i;

function workflowStem(fileName: string): string {
  return fileName.replace(/\.(ya?ml)$/i, '');
}

function hasOrchestratableTrigger(onBlock: unknown): boolean {
  if (onBlock == null) {
    return false;
  }
  if (typeof onBlock === 'string') {
    return onBlock === 'workflow_dispatch' || onBlock === 'workflow_call';
  }
  if (Array.isArray(onBlock)) {
    return onBlock.some(
      (entry) => entry === 'workflow_dispatch' || entry === 'workflow_call',
    );
  }
  if (typeof onBlock === 'object') {
    const keys = Object.keys(onBlock as Record<string, unknown>);
    return keys.includes('workflow_dispatch') || keys.includes('workflow_call');
  }
  return false;
}

function hasRepositoryDispatchTrigger(onBlock: unknown): boolean {
  if (onBlock == null) {
    return false;
  }
  if (typeof onBlock === 'string') {
    return onBlock === 'repository_dispatch';
  }
  if (Array.isArray(onBlock)) {
    return onBlock.some((entry) => entry === 'repository_dispatch');
  }
  if (typeof onBlock === 'object') {
    return Object.keys(onBlock as Record<string, unknown>).includes('repository_dispatch');
  }
  return false;
}

function collectTriggers(onBlock: unknown): string[] {
  if (onBlock == null) {
    return [];
  }
  if (typeof onBlock === 'string') {
    return [onBlock];
  }
  if (Array.isArray(onBlock)) {
    return onBlock.map(String);
  }
  if (typeof onBlock === 'object') {
    return Object.keys(onBlock as Record<string, unknown>);
  }
  return [];
}

function findReferencedWorkflowStems(content: string): Set<string> {
  const stems = new Set<string>();
  for (const match of content.matchAll(LOCAL_WORKFLOW_REF)) {
    stems.add(match[1]);
  }
  return stems;
}

function parseOutputsKeys(outputsRaw: string): string[] {
  const trimmed = outputsRaw.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.keys(parsed as Record<string, unknown>).sort();
    }
  } catch {
    // ponytail: fall back to key scan for templated JSON
  }
  const keys = [...trimmed.matchAll(/"([a-zA-Z0-9_-]+)"\s*:/g)].map((match) => match[1]);
  return [...new Set(keys)].sort();
}

/** Find pipeline-compose-export steps and declared output keys in workflow YAML text. */
export function findPipelineComposeExports(
  content: string,
): { stageId: string; outputKeys: string[] }[] {
  const exports: { stageId: string; outputKeys: string[] }[] = [];
  for (const match of content.matchAll(EXPORT_USES_RE)) {
    const start = match.index ?? 0;
    const block = content.slice(start, start + 1200);
    const stageIdMatch = block.match(/stage_id:\s*['"]?([A-Za-z0-9_.-]+)/);
    if (!stageIdMatch) {
      continue;
    }
    const outputsMatch = block.match(/outputs:\s*(?:>-|>\|-)?\s*['"]?(\{[\s\S]*?\})['"]?/);
    const outputKeys = outputsMatch ? parseOutputsKeys(outputsMatch[1]) : [];
    exports.push({ stageId: stageIdMatch[1], outputKeys });
  }
  return exports;
}

export function buildContextSchemaStub(
  stages: PipelineStage[],
): Record<string, unknown> | undefined {
  const withOutputs = stages.filter((stage) => stage.outputs?.length);
  if (withOutputs.length === 0) {
    return undefined;
  }
  const properties: Record<string, unknown> = {};
  for (const stage of withOutputs) {
    const outputProps: Record<string, unknown> = {};
    for (const key of stage.outputs ?? []) {
      outputProps[key] = { type: 'string' };
    }
    properties[stage.id] = {
      type: 'object',
      properties: outputProps,
    };
  }
  return { type: 'object', properties };
}

export function scanRepositoryDispatchHints(repoRoot: string): string[] {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    return [];
  }

  const hints: string[] = [];
  for (const entry of fs.readdirSync(workflowsDir)) {
    if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) {
      continue;
    }
    const relativePath = path.join('.github', 'workflows', entry).replace(/\\/g, '/');
    const content = fs.readFileSync(path.join(workflowsDir, entry), 'utf8');
    if (!REPOSITORY_DISPATCH_ACTION_RE.test(content)) {
      continue;
    }
    hints.push(
      `${relativePath}: uses repository_dispatch — consider replacing with a pipeline-compose stage (repo: + workflow_dispatch target)`,
    );
  }
  return hints;
}

function enrichStagesWithExports(
  stages: PipelineStage[],
  contentByStem: Map<string, string>,
): PipelineStage[] {
  const outputsByStageId = new Map<string, Set<string>>();
  for (const content of contentByStem.values()) {
    for (const found of findPipelineComposeExports(content)) {
      const keys = outputsByStageId.get(found.stageId) ?? new Set<string>();
      for (const key of found.outputKeys) {
        keys.add(key);
      }
      outputsByStageId.set(found.stageId, keys);
    }
  }

  return stages.map((stage) => {
    const keys = outputsByStageId.get(stage.id);
    if (!keys?.size) {
      return stage;
    }
    return {
      ...stage,
      outputs: [...keys].sort(),
    };
  });
}

export function scanWorkflowsForInit(repoRoot: string): WorkflowInitResult {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  const dispatchHints = scanRepositoryDispatchHints(repoRoot);
  if (!fs.existsSync(workflowsDir)) {
    return { candidates: [], stages: [], skipped: [], dispatchHints };
  }

  const entries = fs
    .readdirSync(workflowsDir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();

  const candidates: WorkflowInitCandidate[] = [];
  const skipped: string[] = [];
  const pathByStem = new Map<string, string>();
  const contentByStem = new Map<string, string>();

  for (const entry of entries) {
    const stem = workflowStem(entry);
    const relativePath = path.join('.github', 'workflows', entry).replace(/\\/g, '/');
    const absolutePath = path.join(workflowsDir, entry);
    const content = fs.readFileSync(absolutePath, 'utf8');
    let doc: unknown;

    try {
      doc = parseYaml(content);
    } catch {
      skipped.push(`${relativePath} (invalid YAML)`);
      continue;
    }

    const onBlock = (doc as { on?: unknown })?.on;
    if (!hasOrchestratableTrigger(onBlock)) {
      if (hasRepositoryDispatchTrigger(onBlock)) {
        skipped.push(
          `${relativePath} (repository_dispatch only — add workflow_dispatch for pipeline-compose stages)`,
        );
      } else {
        skipped.push(`${relativePath} (no workflow_dispatch/workflow_call)`);
      }
      continue;
    }

    pathByStem.set(stem, relativePath);
    contentByStem.set(stem, content);
    candidates.push({
      id: stem,
      workflowPath: relativePath,
      triggers: collectTriggers(onBlock),
    });
  }

  const needsByStem = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const stem = workflowStem(path.basename(candidate.workflowPath));
    const refs = findReferencedWorkflowStems(contentByStem.get(stem) ?? '');
    const needs = new Set<string>();
    for (const refStem of refs) {
      if (refStem === stem) {
        continue;
      }
      if (pathByStem.has(refStem)) {
        needs.add(refStem);
      }
    }
    needsByStem.set(stem, needs);
  }

  let stages: PipelineStage[] = candidates.map((candidate) => {
    const stem = workflowStem(path.basename(candidate.workflowPath));
    const needs = [...(needsByStem.get(stem) ?? [])].sort();
    return {
      id: candidate.id,
      workflow: candidate.workflowPath,
      ...(needs.length > 0 ? { needs } : {}),
    };
  });

  stages = enrichStagesWithExports(stages, contentByStem);
  stages = sortStages(stages);

  return {
    candidates,
    stages,
    skipped,
    dispatchHints,
  };
}

function renderYamlMapping(indent: string, value: unknown): string[] {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return [`${indent}${JSON.stringify(value)}`];
  }
  const lines: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (nested != null && typeof nested === 'object' && !Array.isArray(nested)) {
      lines.push(`${indent}${key}:`);
      lines.push(...renderYamlMapping(`${indent}  `, nested));
    } else {
      lines.push(`${indent}${key}: ${JSON.stringify(nested)}`);
    }
  }
  return lines;
}

export function renderInitPipelineYaml(
  stages: PipelineStage[],
  pipelineName = 'pipeline',
  contextSchema?: Record<string, unknown>,
): string {
  const lines: string[] = [
    `# Generated by pipeline-compose init — review needs, outputs, inputs, and context_schema before use`,
    'version: 2',
    'pipelines:',
    `  ${pipelineName}:`,
  ];

  if (contextSchema) {
    lines.push('    context_schema:');
    lines.push(...renderYamlMapping('      ', contextSchema));
  }

  lines.push('    stages:');

  for (const stage of stages) {
    lines.push(`      - id: ${stage.id}`);
    lines.push(`        workflow: ${stage.workflow}`);
    if (stage.needs && stage.needs.length > 0) {
      lines.push('        needs:');
      for (const dep of stage.needs) {
        lines.push(`          - ${dep}`);
      }
    }
    if (stage.outputs && stage.outputs.length > 0) {
      lines.push('        outputs:');
      for (const key of stage.outputs) {
        lines.push(`          - ${key}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function writeInitPipeline(
  repoRoot: string,
  options: { outputPath?: string; pipelineName?: string; force?: boolean } = {},
): { outputPath: string; result: WorkflowInitResult } {
  const result = scanWorkflowsForInit(repoRoot);
  if (result.stages.length === 0) {
    throw new Error(
      'No workflow_dispatch or workflow_call workflows found under .github/workflows/',
    );
  }

  const outputPath = path.resolve(
    repoRoot,
    options.outputPath ?? path.join('.github', 'pipelines', 'pipeline.yml'),
  );

  if (fs.existsSync(outputPath) && !options.force) {
    throw new Error(`Refusing to overwrite existing file: ${outputPath} (use --force)`);
  }

  const contextSchema = buildContextSchemaStub(result.stages);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    renderInitPipelineYaml(result.stages, options.pipelineName, contextSchema),
    'utf8',
  );

  return { outputPath, result };
}
