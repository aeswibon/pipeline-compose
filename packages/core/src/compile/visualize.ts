import { groupStagesIntoWaves } from './stage-waves.js';
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

const NODE_W = 280;
const NODE_H = 72;
const COL_GAP = 60;
const ROW_GAP = 16;
const PAD = 40;

const LEFT_STRIP_W = 4;

const STATUS: Record<string, { strip: string; icon: string; stroke: string }> = {
  success: { strip: '#2da44e', icon: 'check', stroke: '#2da44e' },
  failure: { strip: '#cf222e', icon: 'x', stroke: '#cf222e' },
  skipped: { strip: '#8b949e', icon: 'minus', stroke: '#8b949e' },
  running: { strip: '#0969da', icon: 'clock', stroke: '#0969da' },
};

const SVG_ICONS: Record<string, string> = {
  check: '<path d="M4 8l3 3 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  minus: '<path d="M4 8h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  clock: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 4v4l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

function statusFor(s: StageState | undefined): string {
  return s?.status ?? 'pending';
}

function iconSvg(status: string): string {
  return SVG_ICONS[STATUS[status]?.icon ?? 'clock'] ?? '';
}

function stripColor(status: string): string {
  return STATUS[status]?.strip ?? '#d0d7de';
}

function iconColor(status: string): string {
  return STATUS[status]?.stroke ?? '#656d76';
}

function formatDuration(ms?: number): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderNode(
  label: string,
  detail: string,
  status: string,
  duration: string,
  x: number,
  y: number,
): string {
  const c = stripColor(status);
  const ic = iconColor(status);
  const icon = iconSvg(status);
  const cx = x + LEFT_STRIP_W + 14;
  const hdrY = y + 20;
  const detY = y + 40;
  let durY = y + 56;

  return `<g>
    <rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="6" fill="#fff" stroke="#d0d7de" stroke-width="1"/>
    <rect x="${x}" y="${y}" width="${LEFT_STRIP_W}" height="${NODE_H}" rx="2" fill="${c}"/>
    <svg x="${cx - 8}" y="${hdrY - 8}" width="16" height="16" viewBox="0 0 16 16" color="${ic}">${icon}</svg>
    <text x="${cx + 12}" y="${hdrY + 1}" font-size="14" font-weight="600" fill="#1f2328">${escapeXml(label)}</text>
    ${detail ? `<text x="${cx + 12}" y="${detY}" font-size="12" fill="#656d76">${escapeXml(detail)}</text>` : ''}
    ${duration ? `<text x="${cx + 12}" y="${durY}" font-size="12" fill="#656d76">${duration}</text>` : ''}
  </g>`;
}

function renderEdge(x1: number, y1: number, x2: number, y2: number, markerEnd: string): string {
  const cx1 = x1 + (x2 - x1) / 2;
  const cy1 = y1;
  const cx2 = x1 + (x2 - x1) / 2;
  const cy2 = y2;
  return `<path d="M${x1},${y1} C${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}" fill="none" stroke="#d0d7de" stroke-width="2" marker-end="url(#${markerEnd})"/>`;
}

export function renderPipelineHtml(
  pipeline: ResolvedPipeline,
  options?: VisualizeOptions,
): string {
  const state = options?.state ?? {};
  const waves = groupStagesIntoWaves(pipeline.stages);

  const nodeCoords = new Map<string, { x: number; y: number; wave: number }>();
  for (let wi = 0; wi < waves.length; wi++) {
    for (let si = 0; si < waves[wi].length; si++) {
      const stage = waves[wi][si];
      nodeCoords.set(stage.id, {
        x: PAD + NODE_W / 2 + wi * (NODE_W + COL_GAP),
        y: PAD + NODE_H / 2 + si * (NODE_H + ROW_GAP),
        wave: wi,
      });
    }
  }

  const maxWave = waves.reduce((m, w) => Math.max(m, w.length), 0);
  const svgW = PAD * 2 + waves.length * NODE_W + (waves.length - 1) * COL_GAP;
  const svgH = PAD * 2 + maxWave * NODE_H + (maxWave - 1) * ROW_GAP;

  const nodes: string[] = [];
  const edges: string[] = [];
  const edgeMarkers = new Set<string>();

  const byId = new Map(pipeline.stages.map((s) => [s.id, s]));

  for (const [stageId, coord] of nodeCoords) {
    const stage = byId.get(stageId);
    if (!stage) continue;
    const s = state[stageId] ? { status: state[stageId]!.status } : undefined;
    const st = statusFor(s);
    const detail = stage.workflow ?? stage.run ?? stage.pipeline_file ?? '';
    nodes.push(
      renderNode(
        stage.id,
        detail,
        st,
        s?.status ? formatDuration(state[stageId]?.durationMs) : '',
        coord.x - NODE_W / 2,
        coord.y - NODE_H / 2,
      ),
    );

    for (const dep of stage.needs ?? []) {
      const depCoord = nodeCoords.get(dep);
      if (!depCoord) continue;
      const markerId = `arrow-${dep}-${stageId}`;
      edgeMarkers.add(markerId);
      edges.push(
        renderEdge(
          depCoord.x + NODE_W / 2,
          depCoord.y,
          coord.x - NODE_W / 2,
          coord.y,
          markerId,
        ),
      );
    }
  }

  const markers = [...edgeMarkers]
    .map((id) => `<marker id="${id}" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto"><polygon points="0 0 10 3 0 6" fill="#d0d7de"/></marker>`)
    .join('\n    ');

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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pipeline: ${escapeXml(pipeline.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
         background: #f6f8fa; color: #1f2328; padding: 24px; }
  h1 { font-size: 20px; font-weight: 600; }
  .subtitle { color: #656d76; font-size: 14px; margin-bottom: 16px; }
  .dag { display: flex; justify-content: center; }
  .dag svg { max-width: 100%; height: auto; }
  .legend { display: flex; gap: 16px; justify-content: center; margin-top: 24px;
            font-size: 12px; color: #656d76; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 4px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
</style>
</head>
<body>
<h1>${escapeXml(pipeline.name)}</h1>
<div class="subtitle">${summaryParts.join(' · ')}</div>
<div class="dag">
<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <defs>
    ${markers}
  </defs>
  ${edges.join('\n  ')}
  ${nodes.join('\n  ')}
</svg>
</div>
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
