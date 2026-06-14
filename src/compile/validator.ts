import AjvImport from 'ajv';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Pipeline } from './parser.js';
import { sortStages } from './topo-sort.js';

type AjvValidator = {
  compile: (schema: object) => ((data: unknown) => boolean) & { errors?: object[] | null };
  errorsText: (errors?: object[] | null) => string;
};

type AjvConstructor = new (options?: object) => AjvValidator;

const Ajv = AjvImport as unknown as AjvConstructor;

function loadSchema(): object {
  const candidates = [
    join(process.cwd(), 'schema/pipeline-v1.schema.json'),
    join(dirname(fileURLToPath(import.meta.url)), '../../schema/pipeline-v1.schema.json'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8')) as object;
    }
  }
  throw new Error(`Pipeline schema not found. Tried: ${candidates.join(', ')}`);
}

const schema = loadSchema();

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

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
