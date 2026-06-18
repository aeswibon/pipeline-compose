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

const STATUS: Record<string, { bar: string; icon: string; bg: string }> = {
  success: { bar: '#2da44e', icon: 'check', bg: '#dafbe1' },
  failure: { bar: '#cf222e', icon: 'x', bg: '#ffebe9' },
  skipped: { bar: '#8b949e', icon: 'minus', bg: '#f6f8fa' },
  running: { bar: '#0969da', icon: 'clock', bg: '#ddf4ff' },
};

const OCTICONS: Record<string, string> = {
  check: '<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>',
  x: '<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>',
  minus: '<path d="M2.75 8a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9A.75.75 0 0 1 2.75 8Z"/>',
  clock: '<path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.86.846a.75.75 0 1 1-.416 1.44l-3.364-1a.75.75 0 0 1-.497-.665L7.25 4.75a.75.75 0 0 1 1.25 0Z"/>',
};

const NODE_W = 280;
const NODE_H = 72;
const COL_GAP = 48;
const ROW_GAP = 16;
const PAD_LEFT = 40;
const PAD_TOP = 40;
const PAD_RIGHT = 40;
const PAD_BOTTOM = 40;

function formatDuration(ms?: number): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderPipelineHtml(
  pipeline: ResolvedPipeline,
  options?: VisualizeOptions,
): string {
  const state = options?.state ?? {};
  const waves = groupStagesIntoWaves(pipeline.stages);

  const maxWave = waves.reduce((m, w) => Math.max(m, w.length), 0);
  const svgW = PAD_LEFT + PAD_RIGHT + waves.length * NODE_W + (waves.length - 1) * COL_GAP;
  const svgH = PAD_TOP + PAD_BOTTOM + maxWave * NODE_H + (maxWave - 1) * ROW_GAP;
  const cx = PAD_LEFT + NODE_W / 2;

  const nodeCoords = new Map<string, { x: number; y: number }>();
  for (let wi = 0; wi < waves.length; wi++) {
    for (let si = 0; si < waves[wi].length; si++) {
      nodeCoords.set(waves[wi][si].id, {
        x: cx + wi * (NODE_W + COL_GAP),
        y: PAD_TOP + NODE_H / 2 + si * (NODE_H + ROW_GAP),
      });
    }
  }

  const byId = new Map(pipeline.stages.map((s) => [s.id, s]));
  const edgeMarkers = new Map<string, string>();

  const edges: string[] = [];
  for (const [stageId, coord] of nodeCoords) {
    const stage = byId.get(stageId);
    if (!stage) continue;
    for (const dep of stage.needs ?? []) {
      const depCoord = nodeCoords.get(dep);
      if (!depCoord) continue;
      const mid = `a-${dep}-${stageId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      edgeMarkers.set(mid, mid);
      const x1 = depCoord.x + NODE_W / 2;
      const y1 = depCoord.y;
      const x2 = coord.x - NODE_W / 2;
      const y2 = coord.y;
      const cx1 = (x1 + x2) / 2;
      edges.push(
        `<path d="M${x1},${y1} C${cx1},${y1} ${cx1},${y2} ${x2},${y2}" fill="none" stroke="#d0d7de" stroke-width="2" marker-end="url(#${mid})"/>`,
      );
    }
  }

  const markers = [...edgeMarkers.values()].map(
    (id) =>
      `<marker id="${id}" viewBox="0 0 10 6" refX="8" refY="3" markerWidth="8" markerHeight="6" orient="auto"><polygon points="0 0 10 3 0 6" fill="#d0d7de"/></marker>`,
  );

  const cards: string[] = [];
  for (const [stageId, coord] of nodeCoords) {
    const stage = byId.get(stageId);
    if (!stage) continue;
    const s = state[stageId];
    const st = s?.status ?? 'pending';
    const c = STATUS[st];
    const iconPath = OCTICONS[c?.icon ?? 'clock'] ?? '';
    const detail = stage.workflow ?? stage.run ?? stage.pipeline_file ?? '';
    const dur = s ? formatDuration(s.durationMs) : '';
    const x = coord.x - NODE_W / 2;
    const y = coord.y - NODE_H / 2;

    cards.push(
      `<div class="node${st ? ` ${st}` : ''}" style="position:absolute;left:${x}px;top:${y}px;width:${NODE_W}px;height:${NODE_H}px">`,
      `  <div class="bar" style="background:${c?.bar ?? '#d0d7de'}"></div>`,
      `  <div class="body">`,
      `    <div class="row">`,
      `      <svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="${c?.bar ?? '#656d76'}" aria-hidden="true">${iconPath}</svg>`,
      `      <span class="name">${escapeXml(stageId)}</span>`,
      `    </div>`,
      detail ? `    <div class="detail">${escapeXml(detail)}</div>` : '',
      dur ? `    <div class="dur">${dur}</div>` : '',
      `  </div>`,
      `</div>`,
    );
  }

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
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
         background: #f6f8fa; color: #1f2328; padding: 24px; }
  h1 { font-size: 20px; font-weight: 600; }
  .subtitle { color: #656d76; font-size: 14px; margin-bottom: 16px; }
  .viewport { position: relative; margin: 20px auto; }
  .viewport svg { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 0; }
  .node { position: absolute; display: flex; background: #fff; border: 1px solid #d0d7de;
          border-radius: 6px; box-shadow: 0 1px 3px rgba(31,35,40,0.12);
          transition: box-shadow .12s ease-out; z-index: 1; overflow: hidden; }
  .node:hover { box-shadow: 0 3px 8px rgba(31,35,40,0.16); }
  .bar { width: 4px; flex-shrink: 0; }
  .body { padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .row { display: flex; align-items: center; gap: 6px; }
  .icon { flex-shrink: 0; }
  .name { font-size: 14px; font-weight: 600; color: #1f2328; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detail { font-size: 12px; color: #656d76; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dur { font-size: 12px; color: #656d76; }
  .legend { display: flex; gap: 16px; justify-content: center; margin-top: 24px;
            font-size: 12px; color: #656d76; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 4px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
</style>
</head>
<body>
<h1>${escapeXml(pipeline.name)}</h1>
<div class="subtitle">${summaryParts.join(' · ')}</div>
<div class="viewport" style="width:${svgW}px;height:${svgH}px">
  <svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
    <defs>${markers.join('\n    ')}</defs>
    ${edges.join('\n  ')}
  </svg>
  ${cards.join('\n  ')}
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
