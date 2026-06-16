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
import { expandCatalogStages, catalogFromDocument } from './catalog.js';
import { sortPipelineDocuments } from './pipeline-sort.js';
import { sortStages } from './topo-sort.js';

function withResolvedStages(
  pipeline: Pipeline,
  pipelineKey?: string,
  lenientNeeds = false,
): Pipeline & { stages: ResolvedStage[] } {
  const defaultGroup = pipeline.group ?? pipelineKey;
  const ordered = lenientNeeds ? sortStagesLenient(pipeline.stages) : sortStages(pipeline.stages);
  return {
    ...pipeline,
    stages: ordered.map((stage) => ({
      ...stage,
      resolvedGroup: resolveStageGroup(stage, defaultGroup, pipelineKey),
      pipelineKey,
    })),
  };
}

function sortStagesLenient(stages: PipelineStage[]): PipelineStage[] {
  try {
    return sortStages(stages);
  } catch {
    return stages;
  }
}

export function pipelineDocumentToList(
  doc: PipelineDocument,
  options: { lenientCatalog?: boolean } = {},
): Pipeline[] {
  const catalog = catalogFromDocument(doc);
  if (!isPipelineV2(doc)) {
    return [
      {
        ...doc,
        stages: expandCatalogStages(doc.stages, catalog, options),
      },
    ];
  }
  return Object.entries(doc.pipelines).map(([key, def]) =>
    definitionToPipeline(
      key,
      def,
      doc.groups,
      doc.concurrency,
      doc.smart_rerun,
      def.context_schema,
      catalog,
      options,
    ),
  );
}

function definitionToPipeline(
  key: string,
  def: PipelineDefinition,
  groups?: PipelineDocumentV2['groups'],
  concurrency?: PipelineDocumentV2['concurrency'],
  smartRerun?: boolean,
  contextSchema?: PipelineDefinition['context_schema'],
  catalog?: Record<string, Omit<PipelineStage, 'id' | 'use'>>,
  options: { lenientCatalog?: boolean } = {},
): Pipeline {
  return {
    name: key,
    version: 1,
    group: def.group ?? key,
    needs: def.needs,
    groups,
    concurrency,
    smart_rerun: smartRerun,
    context_schema: contextSchema,
    stages: expandCatalogStages(def.stages, catalog, options),
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

export function mergePipelines(pipelines: Pipeline[], options: { lenientNeeds?: boolean } = {}): ResolvedPipeline {
  const ordered = sortPipelineDocuments(pipelines);
  assertUniqueStageIds(ordered);

  const stages: ResolvedStage[] = [];
  const multi = ordered.length > 1;
  for (const pipeline of ordered) {
    const resolved = withResolvedStages(pipeline, multi ? pipeline.name : undefined, options.lenientNeeds);
    stages.push(...resolved.stages);
  }

  const primary = ordered[0];
  const companion = [
    ...new Set(ordered.flatMap((pipeline) => pipeline.companion_workflows ?? [])),
  ];
  const concurrency = ordered.find((p) => p.concurrency)?.concurrency;
  const smartRerun = ordered.find((p) => p.smart_rerun)?.smart_rerun;
  const contextSchema = ordered.find((p) => p.context_schema)?.context_schema;
  return {
    name: ordered.length === 1 ? primary.name : 'combined',
    version: 1,
    group: primary.group,
    groups: primary.groups,
    context: primary.context,
    concurrency,
    smart_rerun: smartRerun,
    context_schema: contextSchema,
    companion_workflows: companion.length > 0 ? companion : undefined,
    stages,
  };
}

export function resolvePipelineDocumentForReport(doc: PipelineDocument): ResolvedPipeline {
  const merged = mergePipelines(pipelineDocumentToList(doc, { lenientCatalog: true }), { lenientNeeds: true });
  merged.schemaVersion = isPipelineV2(doc) ? 2 : 1;
  if (isPipelineV2(doc) && doc.companion_workflows?.length) {
    merged.companion_workflows = [
      ...new Set([...(merged.companion_workflows ?? []), ...doc.companion_workflows]),
    ];
  }
  if (isPipelineV2(doc) && doc.smart_rerun) {
    merged.smart_rerun = doc.smart_rerun;
  }
  const contextSchema = isPipelineV2(doc)
    ? Object.values(doc.pipelines).find((p) => p.context_schema)?.context_schema
    : undefined;
  if (contextSchema) {
    merged.context_schema = contextSchema;
  }
  return merged;
}

export function resolvePipelineDocument(doc: PipelineDocument): ResolvedPipeline {
  const merged = mergePipelines(pipelineDocumentToList(doc));
  merged.schemaVersion = isPipelineV2(doc) ? 2 : 1;
  if (isPipelineV2(doc) && doc.companion_workflows?.length) {
    merged.companion_workflows = [
      ...new Set([...(merged.companion_workflows ?? []), ...doc.companion_workflows]),
    ];
  }
  if (isPipelineV2(doc) && doc.smart_rerun) {
    merged.smart_rerun = doc.smart_rerun;
  }
  const contextSchemaResolved = isPipelineV2(doc)
    ? Object.values(doc.pipelines).find((p) => p.context_schema)?.context_schema
    : undefined;
  if (contextSchemaResolved) {
    merged.context_schema = contextSchemaResolved;
  }
  return merged;
}

export function flattenStages(stages: PipelineStage[]): ResolvedStage[] {
  return sortStages(stages).map((stage) => ({
    ...stage,
    resolvedGroup: resolveStageGroup(stage),
  }));
}
