export type { Pipeline, PipelineStage } from './compile/parser.js';
export { loadPipeline } from './compile/parser.js';
export { validatePipeline } from './compile/validator.js';
export { sortStages } from './compile/topo-sort.js';
export { generateWorkflow } from './compile/codegen.js';
export type { GenerateOptions } from './compile/codegen.js';
export { evaluateExpression, mergeContext } from './lib/expressions.js';
