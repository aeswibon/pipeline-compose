type EvalContext = {
  github: Record<string, unknown>;
  context: Record<string, unknown>;
};

export function evaluateExpression(expr: string, ctx: EvalContext): boolean {
  const trimmed = expr.trim();

  if (trimmed.includes('||')) {
    return splitTopLevel(trimmed, '||').some((part) =>
      evaluateExpression(part, ctx),
    );
  }

  if (trimmed.includes('&&')) {
    return splitTopLevel(trimmed, '&&').every((part) =>
      evaluateExpression(part, ctx),
    );
  }

  const startsWithMatch = trimmed.match(/^startsWith\(\s*([^,]+)\s*,\s*'([^']*)'\s*\)$/);
  if (startsWithMatch) {
    const val = resolveValue(startsWithMatch[1].trim(), ctx);
    return String(val ?? '').startsWith(startsWithMatch[2]);
  }

  const containsMatch = trimmed.match(/^contains\(\s*([^,]+)\s*,\s*'([^']*)'\s*\)$/);
  if (containsMatch) {
    const val = resolveValue(containsMatch[1].trim(), ctx);
    return String(val ?? '').includes(containsMatch[2]);
  }

  const contextEqMatch = trimmed.match(
    /^context\.([a-z0-9-]+)\.([a-z0-9_]+)\s*==\s*'([^']*)'$/,
  );
  if (contextEqMatch) {
    const stage = ctx.context[contextEqMatch[1]] as Record<string, unknown> | undefined;
    return stage?.[contextEqMatch[2]] === contextEqMatch[3];
  }

  const githubEqMatch = trimmed.match(/^github\.([a-z0-9_]+)\s*==\s*'([^']*)'$/);
  if (githubEqMatch) {
    const value = resolveRef(`github.${githubEqMatch[1]}`, ctx);
    return String(value ?? '') === githubEqMatch[2];
  }

  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }

  throw new Error(`Unsupported expression: ${expr}`);
}

function splitTopLevel(expr: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inString = false;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "'") {
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString && expr.startsWith(delimiter, i)) {
      parts.push(current.trim());
      current = '';
      i += delimiter.length - 1;
      continue;
    }
    current += ch;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function resolveValue(ref: string, ctx: EvalContext): unknown {
  const contextMatch = ref.match(/^context\.([a-z0-9-]+)\.([a-z0-9_]+)$/);
  if (contextMatch) {
    const stage = ctx.context[contextMatch[1]] as Record<string, unknown> | undefined;
    return stage?.[contextMatch[2]];
  }
  if (ref.startsWith('github.')) {
    return resolveRef(ref, ctx);
  }
  throw new Error(`Unsupported value ref: ${ref}`);
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

export function parseRepoSlug(
  slug: string,
): { owner: string; repo: string } {
  const match = slug.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) {
    throw new Error(`Invalid repo slug "${slug}" (expected owner/repo)`);
  }
  return { owner: match[1], repo: match[2] };
}
