import type { Pipeline } from '../compile/parser.js';
import type { GitHubActionsClient } from './github.js';
export type OrchestratorOptions = {
    ref: string;
    github: Record<string, unknown>;
    timeoutMs?: number;
    pollMs?: number;
};
export type StageResult = {
    stageId: string;
    runId: number;
    outputs: Record<string, string>;
};
export declare function runPipeline(pipeline: Pipeline, client: GitHubActionsClient, options: OrchestratorOptions): Promise<StageResult[]>;
