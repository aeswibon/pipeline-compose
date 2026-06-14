import type {
  Pipeline,
  PipelineDefinition,
  PipelineDocument,
  PipelineDocumentV2,
  PipelineStage,
  ResolvedPipeline,
  ResolvedStage,
} from './parser.js';
import { isPipelineV2, resolveStageGroup } from './parser.js';
import { sortPipelineDocuments } from './pipeline-sort.js';
import { sortStages } from './topo-sort.js';

function withResolvedStages(
  pipeline: Pipeline,
  pipelineKey?: string,
): Pipeline & { stages: ResolvedStage[] } {
  const defaultGroup = pipeline.group ?? pipelineKey;
  return {
    ...pipeline,
    stages: sortStages(pipeline.stages).map((stage) => ({
      ...stage,
      resolvedGroup: resolveStageGroup(stage, defaultGroup, pipelineKey),
      pipelineKey,
    })),
  };
}

export function pipelineDocumentToList(doc: PipelineDocument): Pipeline[] {
  if (!isPipelineV2(doc)) {
    return [doc];
  }
  return Object.entries(doc.pipelines).map(([key, def]) =>
    definitionToPipeline(key, def, doc.groups),
  );
}

function definitionToPipeline(
  key: string,
  def: PipelineDefinition,
  groups?: PipelineDocumentV2['groups'],
): Pipeline {
  return {
    name: key,
    version: 1,
    group: def.group ?? key,
    needs: def.needs,
    groups,
    stages: def.stages,
  };
}

export function assertUniqueStageIds(pipelines: Pipeline[]): void {
  const seen = new Set<string>();
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      if (seen.has(stage.id)) {
        throw new Error(`Duplicate stage id across pipelines: ${stage.id}`);
      }
      seen.add(stage.id);
    }
  }
}

export function mergePipelines(pipelines: Pipeline[]): ResolvedPipeline {
  const ordered = sortPipelineDocuments(pipelines);
  assertUniqueStageIds(ordered);

  const stages: ResolvedStage[] = [];
  const multi = ordered.length > 1;
  for (const pipeline of ordered) {
    const resolved = withResolvedStages(pipeline, multi ? pipeline.name : undefined);
    stages.push(...resolved.stages);
  }

  const primary = ordered[0];
  const companion = [
    ...new Set(ordered.flatMap((pipeline) => pipeline.companion_workflows ?? [])),
  ];
  return {
    name: ordered.length === 1 ? primary.name : 'combined',
    version: 1,
    group: primary.group,
    groups: primary.groups,
    context: primary.context,
    companion_workflows: companion.length > 0 ? companion : undefined,
    stages,
  };
}

export function resolvePipelineDocument(doc: PipelineDocument): ResolvedPipeline {
  const merged = mergePipelines(pipelineDocumentToList(doc));
  merged.schemaVersion = isPipelineV2(doc) ? 2 : 1;
  if (isPipelineV2(doc) && doc.companion_workflows?.length) {
    merged.companion_workflows = [
      ...new Set([...(merged.companion_workflows ?? []), ...doc.companion_workflows]),
    ];
  }
  return merged;
}

export function flattenStages(stages: PipelineStage[]): ResolvedStage[] {
  return sortStages(stages).map((stage) => ({
    ...stage,
    resolvedGroup: resolveStageGroup(stage),
  }));
}
