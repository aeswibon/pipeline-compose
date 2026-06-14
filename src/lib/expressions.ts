type EvalContext = {
  github: Record<string, unknown>;
  context: Record<string, unknown>;
};

export function evaluateExpression(expr: string, ctx: EvalContext): boolean {
  const trimmed = expr.trim();

  const startsWithMatch = trimmed.match(/^startsWith\(\s*([^,]+)\s*,\s*'([^']*)'\s*\)$/);
  if (startsWithMatch) {
    const val = resolveRef(startsWithMatch[1].trim(), ctx);
    return String(val ?? '').startsWith(startsWithMatch[2]);
  }

  const eqMatch = trimmed.match(/^context\.([a-z0-9-]+)\.([a-z0-9_]+)\s*==\s*'([^']*)'$/);
  if (eqMatch) {
    const stage = ctx.context[eqMatch[1]] as Record<string, unknown> | undefined;
    return stage?.[eqMatch[2]] === eqMatch[3];
  }

  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }

  throw new Error(`Unsupported expression: ${expr}`);
}

function resolveRef(ref: string, ctx: EvalContext): unknown {
  const parts = ref.split('.');
  const root = parts[0];
  if (root === 'github') {
    return parts.slice(1).reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, ctx.github);
  }
  throw new Error(`Unsupported ref: ${ref}`);
}

export function mergeContext(
  base: Record<string, unknown>,
  stageId: string,
  outputs: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...base,
    [stageId]: outputs,
  };
}
