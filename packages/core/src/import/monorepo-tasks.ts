import type { PipelineStage } from '../compile/parser.js';

export type MonorepoTaskGraph = Record<
  string,
  {
    dependsOn?: string[];
  }
>;

export type ImportMonorepoOptions = {
  /** Workflow path pattern; `$task` is replaced with the task id. */
  workflowPattern?: string;
};

const DEFAULT_WORKFLOW_PATTERN = '.github/workflows/$task.yml';

/** Normalize turbo/nx dependsOn to same-pipeline stage ids (drops ^upstream refs). */
export function normalizeDependsOn(deps: string[] | undefined): string[] | undefined {
  if (!deps?.length) {
    return undefined;
  }
  const normalized = deps
    .filter((dep) => !dep.startsWith('^'))
    .filter((dep, index, all) => dep.length > 0 && all.indexOf(dep) === index);
  return normalized.length > 0 ? normalized : undefined;
}

export function topoSortTaskIds(graph: MonorepoTaskGraph): string[] {
  const ids = Object.keys(graph);
  const sorted: string[] = [];
  const pending = new Set(ids);

  while (pending.size > 0) {
    const ready = [...pending].filter((id) => {
      const deps = normalizeDependsOn(graph[id]?.dependsOn) ?? [];
      return deps.every((dep) => !pending.has(dep));
    });
    if (ready.length === 0) {
      throw new Error(`Monorepo task graph has a cycle among: ${[...pending].join(', ')}`);
    }
    ready.sort();
    for (const id of ready) {
      pending.delete(id);
      sorted.push(id);
    }
  }

  return sorted;
}

export function stagesFromMonorepoTaskGraph(
  graph: MonorepoTaskGraph,
  options: ImportMonorepoOptions = {},
): PipelineStage[] {
  const pattern = options.workflowPattern ?? DEFAULT_WORKFLOW_PATTERN;
  return topoSortTaskIds(graph).map((id) => ({
    id,
    workflow: pattern.replace(/\$task/g, id),
    needs: normalizeDependsOn(graph[id]?.dependsOn),
  }));
}

export function parseTurboTaskGraph(raw: unknown): MonorepoTaskGraph {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('turbo.json must be a JSON object');
  }
  const doc = raw as Record<string, unknown>;
  const tasks = (doc.tasks ?? doc.pipeline) as MonorepoTaskGraph | undefined;
  if (!tasks || typeof tasks !== 'object') {
    throw new Error('turbo.json must include a tasks or pipeline object');
  }
  return tasks;
}

export function parseNxTargetDefaults(raw: unknown): MonorepoTaskGraph {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('nx.json must be a JSON object');
  }
  const doc = raw as Record<string, unknown>;
  const defaults = doc.targetDefaults as MonorepoTaskGraph | undefined;
  if (!defaults || typeof defaults !== 'object') {
    throw new Error('nx.json must include targetDefaults');
  }
  return defaults;
}
