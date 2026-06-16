import { parse as parseYaml } from 'yaml';

export interface PipelineGroupMeta {
  description?: string;
}

export interface PipelineConcurrency {
  group: string;
  cancel_in_progress?: boolean;
}

export interface PipelineStage {
  id: string;
  /** Reference a reusable entry from the document `catalog` map. */
  use?: string;
  workflow?: string;
  /** Nested pipeline YAML (mutually exclusive with workflow). */
  pipeline_file?: string;
  /** Pipeline key inside a v2 file (required when the file defines multiple pipelines). */
  pipeline?: string;
  /** Target repository for cross-repo dispatch (owner/repo). Defaults to GITHUB_REPOSITORY. */
  repo?: string;
  group?: string;
  when?: string;
  needs?: string[];
  environment?: string;
  inputs?: Record<string, string>;
  outputs?: string[];
}

export interface Pipeline {
  name: string;
  version: 1;
  group?: string;
  needs?: string[];
  groups?: Record<string, PipelineGroupMeta>;
  /** Workflows not driven by stages but intentionally part of the repo (e.g. native release.yml). */
  companion_workflows?: string[];
  /** Serialize or cancel overlapping runs of the same entry workflow (enforced by run action). */
  concurrency?: PipelineConcurrency;
  /** Reuse prior attempt stage outputs on workflow re-run when inputs are unchanged. */
  smart_rerun?: boolean;
  context?: Record<string, string>;
  /** JSON Schema describing expected context.<stage>.<output> shapes. */
  context_schema?: Record<string, unknown>;
  /** Reusable stage templates referenced by stage `use`. */
  catalog?: Record<string, Omit<PipelineStage, 'id' | 'use'>>;
  stages: PipelineStage[];
}

export interface PipelineDefinition {
  group?: string;
  needs?: string[];
  /** JSON Schema describing expected context.<stage>.<output> shapes. */
  context_schema?: Record<string, unknown>;
  stages: PipelineStage[];
}

export interface PipelineDocumentV2 {
  version: 2;
  groups?: Record<string, PipelineGroupMeta>;
  /** Workflows not driven by stages (e.g. tag entry `release.yml`). */
  companion_workflows?: string[];
  /** Applied to merged pipeline when using pipeline-compose-run. */
  concurrency?: PipelineConcurrency;
  smart_rerun?: boolean;
  /** Reusable stage templates referenced by stage `use`. */
  catalog?: Record<string, Omit<PipelineStage, 'id' | 'use'>>;
  pipelines: Record<string, PipelineDefinition>;
}

export type PipelineDocument = Pipeline | PipelineDocumentV2;

export interface ResolvedStage extends PipelineStage {
  resolvedGroup?: string;
  pipelineKey?: string;
}

export interface ResolvedPipeline extends Pipeline {
  stages: ResolvedStage[];
  /** Source YAML schema version (set by resolvePipelineDocument). */
  schemaVersion?: 1 | 2;
}

export function isPipelineV2(doc: PipelineDocument): doc is PipelineDocumentV2 {
  return (doc as PipelineDocumentV2).version === 2;
}

export function parsePipelineDocument(yaml: string): PipelineDocument {
  return parseYaml(yaml) as PipelineDocument;
}

export function resolveStageGroup(
  stage: PipelineStage,
  pipelineGroup?: string,
  pipelineKey?: string,
): string | undefined {
  return stage.group ?? pipelineGroup ?? pipelineKey;
}

export function loadPipeline(opts: {
  fileYaml: string;
  inlineYaml?: string;
}): Pipeline {
  const fileDoc = parseYaml(opts.fileYaml) as Pipeline;
  if (!opts.inlineYaml?.trim()) {
    return fileDoc;
  }
  const inlineDoc = parseYaml(opts.inlineYaml) as Partial<Pipeline>;
  return {
    ...fileDoc,
    context: { ...fileDoc.context, ...inlineDoc.context },
    stages: inlineDoc.stages ?? fileDoc.stages,
  };
}
