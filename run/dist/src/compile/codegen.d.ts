import type { Pipeline } from './parser.js';
export interface GenerateOptions {
    /** Path to pipeline source (used in header and compile-check). */
    pipelineFile?: string;
    /** Generated workflow path (compile-check output + check target). */
    workflowOutput?: string;
    /** compile action ref, e.g. aeswibon/pipeline-compose/compile@master or ./compile */
    compileAction?: string;
    defaultBranch?: string;
    /** Tag prefix for refs/tags/{tagPrefix}* (default v). */
    tagPrefix?: string;
}
export declare function generateWorkflow(pipeline: Pipeline, opts?: GenerateOptions): string;
