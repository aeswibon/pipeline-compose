import * as fs from 'node:fs';
import * as path from 'node:path';

export const STATE_DIR = '.pipeline-compose/state';

export interface StageStateRecord {
  id: string;
  status: 'success' | 'failure' | 'skipped';
  outputs: Record<string, string>;
  workflow: string;
  repo?: string;
  fingerprint?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface PipelineStateRecord {
  version: 1;
  pipelineName: string;
  runId: string;
  startedAt: string;
  completedAt?: string;
  stages: StageStateRecord[];
  success: boolean;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

function stateFileName(pipelineName: string, runId: string): string {
  return `${safeName(pipelineName)}-${safeName(runId)}.json`;
}

export function savePipelineState(
  baseDir: string,
  record: PipelineStateRecord,
): string {
  const dir = path.join(baseDir, STATE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, stateFileName(record.pipelineName, record.runId));
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
  return filePath;
}

export function loadPipelineState(
  baseDir: string,
  pipelineName: string,
  runId: string,
): PipelineStateRecord | null {
  const filePath = path.join(baseDir, STATE_DIR, stateFileName(pipelineName, runId));
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PipelineStateRecord;
    if (parsed?.version !== 1 || !parsed.pipelineName || !parsed.runId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function listPipelineStates(baseDir: string, pipelineName?: string): PipelineStateRecord[] {
  const dir = path.join(baseDir, STATE_DIR);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const records: PipelineStateRecord[] = [];
  for (const file of files) {
    if (pipelineName && !file.startsWith(safeName(pipelineName))) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as PipelineStateRecord;
      if (parsed?.version === 1) records.push(parsed);
    } catch { /* skip corrupt */ }
  }
  return records.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export function formatPipelineState(record: PipelineStateRecord): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  pipeline: ${record.pipelineName}`);
  lines.push(`  run:      ${record.runId}`);
  lines.push(`  started:  ${record.startedAt}`);
  if (record.completedAt) lines.push(`  ended:    ${record.completedAt}`);
  lines.push(`  result:   ${record.success ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('  stages:');
  for (const s of record.stages) {
    const icon = s.status === 'success' ? ' ✓' : s.status === 'skipped' ? ' −' : ' ✗';
    const dur = formatDuration(s.durationMs);
    lines.push(`   ${icon}  ${s.id}  (${s.status}, ${dur})`);
    if (s.repo) lines.push(`         repo: ${s.repo}`);
    const keys = Object.keys(s.outputs);
    if (keys.length > 0) lines.push(`         outputs: ${keys.join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s % 60}s`;
}

export function stageFingerprintFromState(stage: StageStateRecord): string | undefined {
  return stage.fingerprint;
}
