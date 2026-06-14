export function resolveInputValue(
  template: string,
  context: Record<string, Record<string, string>>,
): string {
  return template.replace(
    /\$\{\{\s*context\.([a-z0-9-]+)\.([a-z0-9_]+)\s*\}\}/gi,
    (_, stageId, key) => context[stageId]?.[key] ?? '',
  );
}

export function resolveStageInputs(
  inputs: Record<string, string> | undefined,
  context: Record<string, Record<string, string>>,
): Record<string, string> {
  if (!inputs) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => [
      key,
      resolveInputValue(value, context),
    ]),
  );
}
