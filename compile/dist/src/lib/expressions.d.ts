type EvalContext = {
    github: Record<string, unknown>;
    context: Record<string, unknown>;
};
export declare function evaluateExpression(expr: string, ctx: EvalContext): boolean;
export declare function mergeContext(base: Record<string, unknown>, stageId: string, outputs: Record<string, unknown>): Record<string, unknown>;
export {};
