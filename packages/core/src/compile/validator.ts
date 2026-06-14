import AjvImport from 'ajv';
import type {
  Pipeline,
  PipelineDocument,
  ResolvedPipeline,
} from './parser.js';
import { isPipelineV2 } from './parser.js';
import { mergePipelines, pipelineDocumentToList, resolvePipelineDocument } from './pipeline-resolve.js';
import { sortStages } from './topo-sort.js';
import schemaV1 from '../../schema/pipeline-v1.schema.json' with { type: 'json' };
import schemaV2 from '../../schema/pipeline-v2.schema.json' with { type: 'json' };

type AjvValidator = {
  compile: (schema: object) => ((data: unknown) => boolean) & { errors?: object[] | null };
  errorsText: (errors?: object[] | null) => string;
};

type AjvConstructor = new (options?: object) => AjvValidator;

const Ajv = AjvImport as unknown as AjvConstructor;

const ajv = new Ajv({ allErrors: true, strict: false });
type SchemaValidate = ((data: unknown) => boolean) & { errors?: object[] | null };
const validateV1 = ajv.compile(schemaV1 as object) as SchemaValidate;
const validateV2 = ajv.compile(schemaV2 as object) as SchemaValidate;

function assertSchema(
  label: string,
  validate: ((data: unknown) => boolean) & { errors?: object[] | null },
  data: unknown,
): void {
  if (!validate(data)) {
    throw new Error(`Invalid ${label}: ${ajv.errorsText(validate.errors)}`);
  }
}

function assertUniqueStageIds(pipeline: Pipeline): void {
  const ids = new Set<string>();
  for (const stage of pipeline.stages) {
    if (ids.has(stage.id)) {
      throw new Error(`Duplicate stage id: ${stage.id}`);
    }
    ids.add(stage.id);
  }
}

export function validatePipelineDocument(doc: PipelineDocument): ResolvedPipeline {
  if (isPipelineV2(doc)) {
    assertSchema('pipeline v2', validateV2, doc);
    for (const [key, def] of Object.entries(doc.pipelines)) {
      assertUniqueStageIds({
        name: key,
        version: 1,
        stages: def.stages,
      });
      sortStages(def.stages);
    }
    return resolvePipelineDocument(doc);
  }

  assertSchema('pipeline v1', validateV1, doc);
  assertUniqueStageIds(doc);
  const sorted = sortStages(doc.stages);
  return resolvePipelineDocument({ ...doc, stages: sorted });
}

export function validatePipelineDocuments(docs: PipelineDocument[]): ResolvedPipeline {
  const pipelines = docs.flatMap((doc) => {
    if (isPipelineV2(doc)) {
      assertSchema('pipeline v2', validateV2, doc);
      for (const [key, def] of Object.entries(doc.pipelines)) {
        assertUniqueStageIds({
          name: key,
          version: 1,
          stages: def.stages,
        });
        sortStages(def.stages);
      }
    } else {
      assertSchema('pipeline v1', validateV1, doc);
      assertUniqueStageIds(doc);
      sortStages(doc.stages);
    }
    return pipelineDocumentToList(doc);
  });
  return mergePipelines(pipelines);
}

export function validatePipeline(pipeline: Pipeline): Pipeline {
  assertSchema('pipeline v1', validateV1, pipeline);
  assertUniqueStageIds(pipeline);
  return { ...pipeline, stages: sortStages(pipeline.stages) };
}
