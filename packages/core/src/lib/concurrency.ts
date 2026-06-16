import type { PipelineConcurrency } from '../compile/parser.js';

/** Resolve `${{ github.ref }}` placeholders in a concurrency group template. */
export function resolveConcurrencyGroup(
  template: string,
  github: Record<string, unknown>,
): string {
  return template.replace(
    /\$\{\{\s*github\.([a-z_]+)\s*\}\}/gi,
    (_, key: string) => String(github[key] ?? ''),
  );
}

export function concurrencyFromCodegen(
  concurrency: PipelineConcurrency | undefined,
  fallbackGroup: string,
): Record<string, unknown> {
  if (!concurrency) {
    return { group: fallbackGroup, 'cancel-in-progress': false };
  }
  return {
    group: concurrency.group,
    'cancel-in-progress': concurrency.cancel_in_progress ?? false,
  };
}
