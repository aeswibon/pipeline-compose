export type WorkflowSummary = {
    id: number;
    path: string;
    name: string;
};
export type WorkflowRun = {
    id: number;
    status: string;
    conclusion: string | null;
    created_at: string;
    head_branch: string | null;
};
export type WorkflowJob = {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    outputs?: Record<string, string>;
};
export type WorkflowArtifact = {
    id: number;
    name: string;
};
export declare function artifactNameForStage(stageId: string): string;
export declare class GitHubActionsClient {
    private readonly token;
    private readonly owner;
    private readonly repo;
    private readonly apiUrl;
    constructor(token: string, owner: string, repo: string, apiUrl?: string);
    private request;
    private downloadBinary;
    getWorkflowByPath(workflowPath: string): Promise<WorkflowSummary>;
    dispatchWorkflow(workflowId: number, ref: string, inputs: Record<string, string>): Promise<void>;
    waitForRun(workflowId: number, ref: string, notBeforeMs: number, timeoutMs: number, pollMs: number): Promise<WorkflowRun>;
    waitForRunCompletion(runId: number, timeoutMs: number, pollMs: number): Promise<WorkflowRun>;
    getJob(jobId: number): Promise<WorkflowJob>;
    listRunJobs(runId: number): Promise<WorkflowJob[]>;
    listRunArtifacts(runId: number): Promise<WorkflowArtifact[]>;
    downloadArtifactOutputs(artifactId: number): Promise<Record<string, string>>;
    waitForStageArtifact(runId: number, stageId: string, timeoutMs: number, pollMs: number): Promise<Record<string, string>>;
}
export declare function stripRefPrefix(ref: string): string;
