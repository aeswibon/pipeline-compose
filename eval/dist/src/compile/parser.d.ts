export interface PipelineStage {
    id: string;
    workflow: string;
    when?: string;
    needs?: string[];
    environment?: string;
    inputs?: Record<string, string>;
    outputs?: string[];
}
export interface Pipeline {
    name: string;
    version: 1;
    context?: Record<string, string>;
    stages: PipelineStage[];
}
export declare function loadPipeline(opts: {
    fileYaml: string;
    inlineYaml?: string;
}): Pipeline;
