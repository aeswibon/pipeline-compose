/** Match `${{ context.stage-id.output_key }}` in stage input values. */
export const CONTEXT_INPUT_REF_RE =
  /\$\{\{\s*context\.([a-z0-9-]+)\.([a-z0-9_]+)\s*\}\}/gi;

export interface ContextInputRef {
  stageId: string;
  outputKey: string;
}

export function parseContextInputRefs(value: string): ContextInputRef[] {
  const refs: ContextInputRef[] = [];
  for (const match of value.matchAll(CONTEXT_INPUT_REF_RE)) {
    refs.push({ stageId: match[1], outputKey: match[2] });
  }
  return refs;
}
