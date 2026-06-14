import AjvImport from 'ajv';
import type { Pipeline } from './parser.js';
import { sortStages } from './topo-sort.js';
import schema from '../../schema/pipeline-v1.schema.json' with { type: 'json' };

type AjvValidator = {
  compile: (schema: object) => ((data: unknown) => boolean) & { errors?: object[] | null };
  errorsText: (errors?: object[] | null) => string;
};

type AjvConstructor = new (options?: object) => AjvValidator;

const Ajv = AjvImport as unknown as AjvConstructor;

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema as object);

export function validatePipeline(pipeline: Pipeline): Pipeline {
  if (!validateSchema(pipeline)) {
    throw new Error(`Invalid pipeline: ${ajv.errorsText(validateSchema.errors)}`);
  }
  const ids = new Set<string>();
  for (const s of pipeline.stages) {
    if (ids.has(s.id)) {
      throw new Error(`Duplicate stage id: ${s.id}`);
    }
    ids.add(s.id);
  }
  return { ...pipeline, stages: sortStages(pipeline.stages) };
}
