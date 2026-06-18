import { renderPipelineMermaid } from './mermaid.js';
import type { PipelineStateRecord } from '../lib/pipeline-state.js';
import type { ResolvedPipeline } from './parser.js';

export interface VisualizeOptions {
  state?: Record<string, StageState>;
  title?: string;
}

export interface StageState {
  status: 'success' | 'failure' | 'skipped' | 'running';
  durationMs?: number;
}

const STATUS_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  success: { fill: '#dafbe1', stroke: '#2da44e', label: 'success' },
  failure: { fill: '#ffebe9', stroke: '#cf222e', label: 'failure' },
  skipped: { fill: '#f6f8fa', stroke: '#8b949e', label: 'skipped' },
  running: { fill: '#ddf4ff', stroke: '#0969da', label: 'running' },
};

function nodeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderPipelineHtml(
  pipeline: ResolvedPipeline,
  options?: VisualizeOptions,
): string {
  const state = options?.state ?? {};

  const mermaidDef = renderPipelineMermaid(pipeline);
  const lines = mermaidDef.split('\n');

  const definedStates = new Set(Object.keys(state));
  const hasStates = definedStates.size > 0;

  if (hasStates) {
    const classDefs: string[] = [];
    const assignments: string[] = [];

    for (const [status, colors] of Object.entries(STATUS_COLORS)) {
      classDefs.push(`  classDef ${status} fill:${colors.fill},stroke:${colors.stroke},stroke-width:3px,color:#1f2328`);
    }

    for (const stage of pipeline.stages) {
      const s = state[stage.id];
      if (s && STATUS_COLORS[s.status]) {
        assignments.push(`  class ${nodeId(stage.id)} ${s.status}`);
      }
    }

    if (classDefs.length > 0) {
      lines.push('');
      lines.push(...classDefs);
    }
    if (assignments.length > 0) {
      lines.push('');
      lines.push(...assignments);
    }
  }

  const mermaidSrc = escapeHtml(lines.join('\n'));

  const successCount = pipeline.stages.filter((s) => state[s.id]?.status === 'success').length;
  const failCount = pipeline.stages.filter((s) => state[s.id]?.status === 'failure').length;
  const skipCount = pipeline.stages.filter((s) => state[s.id]?.status === 'skipped').length;
  const runCount = pipeline.stages.filter((s) => state[s.id]?.status === 'running').length;
  const pendingCount = pipeline.stages.length - successCount - failCount - skipCount - runCount;

  const summaryParts: string[] = [`${pipeline.stages.length} stages`];
  if (successCount) summaryParts.push(`${successCount} success`);
  if (failCount) summaryParts.push(`${failCount} failed`);
  if (skipCount) summaryParts.push(`${skipCount} skipped`);
  if (runCount) summaryParts.push(`${runCount} running`);
  if (pendingCount) summaryParts.push(`${pendingCount} pending`);
  const summary = summaryParts.join(' · ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pipeline: ${escapeHtml(pipeline.name)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
         background: #f6f8fa; color: #1f2328; padding: 24px; }
  h1 { font-size: 20px; font-weight: 600; }
  .subtitle { color: #656d76; font-size: 14px; margin-bottom: 16px; }
  .mermaid { display: flex; justify-content: center; }
  .mermaid svg { max-width: 100%; height: auto; }
  .legend { display: flex; gap: 16px; justify-content: center; margin-top: 24px;
            font-size: 12px; color: #656d76; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 4px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
</style>
</head>
<body>
<h1>${escapeHtml(pipeline.name)}</h1>
<div class="subtitle">${summary}</div>
<pre class="mermaid">
${mermaidSrc}
</pre>
<div class="legend">
  <span class="legend-item"><span class="legend-dot" style="background:#2da44e"></span> success</span>
  <span class="legend-item"><span class="legend-dot" style="background:#cf222e"></span> failure</span>
  <span class="legend-item"><span class="legend-dot" style="background:#8b949e"></span> skipped</span>
  <span class="legend-item"><span class="legend-dot" style="background:#0969da"></span> running</span>
  <span class="legend-item"><span class="legend-dot" style="background:#d0d7de"></span> pending</span>
</div>
</body>
</html>`;
}

export function buildVisualizeState(
  pipeline: ResolvedPipeline,
  stateRecords?: PipelineStateRecord[],
  runId?: string,
): Record<string, StageState> {
  const result: Record<string, StageState> = {};
  if (!stateRecords?.length) return result;

  const target = runId
    ? stateRecords.find((r) => r.runId === runId)
    : stateRecords[0];
  if (!target) return result;

  for (const s of target.stages) {
    if (s.status === 'success' || s.status === 'failure' || s.status === 'skipped') {
      result[s.id] = { status: s.status, durationMs: s.durationMs };
    }
  }
  return result;
}
