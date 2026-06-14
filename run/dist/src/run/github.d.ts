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
export declare class GitHubActionsClient {
    private readonly token;
    private readonly owner;
    private readonly repo;
    private readonly apiUrl;
    constructor(token: string, owner: string, repo: string, apiUrl?: string);
    private request;
    getWorkflowByPath(workflowPath: string): Promise<WorkflowSummary>;
    dispatchWorkflow(workflowId: number, ref: string, inputs: Record<string, string>): Promise<void>;
    waitForRun(workflowId: number, ref: string, notBeforeMs: number, timeoutMs: number, pollMs: number): Promise<WorkflowRun>;
    waitForRunCompletion(runId: number, timeoutMs: number, pollMs: number): Promise<WorkflowRun>;
    listRunJobs(runId: number): Promise<WorkflowJob[]>;
}
export declare function stripRefPrefix(ref: string): string;
