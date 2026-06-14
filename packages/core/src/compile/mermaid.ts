import type { ResolvedPipeline, ResolvedStage } from './parser.js';
import { resolveStageGroup } from './parser.js';

function mermaidNodeId(stageId: string): string {
  return stageId.replace(/[^a-zA-Z0-9_]/g, '_');
}

function stageNodeLabel(stage: ResolvedStage, pipeline: ResolvedPipeline): string {
  const group = stage.resolvedGroup ?? resolveStageGroup(stage, pipeline.group);
  const parts = [stage.id];
  if (group) {
    parts.push(`(${group})`);
  }
  if (stage.repo) {
    parts.push(`[${stage.repo}]`);
  }
  return parts.join(' ');
}

export function renderPipelineMermaid(pipeline: ResolvedPipeline): string {
  const lines: string[] = ['flowchart TD'];
  const stageIds = new Set(pipeline.stages.map((stage) => stage.id));

  for (const stage of pipeline.stages) {
    const nodeId = mermaidNodeId(stage.id);
    const label = stageNodeLabel(stage, pipeline).replace(/"/g, '\\"');
    lines.push(`  ${nodeId}["${label}"]`);
  }

  for (const stage of pipeline.stages) {
    const target = mermaidNodeId(stage.id);
    for (const dep of stage.needs ?? []) {
      if (!stageIds.has(dep)) {
        continue;
      }
      lines.push(`  ${mermaidNodeId(dep)} --> ${target}`);
    }
  }

  if (pipeline.stages.every((stage) => (stage.needs ?? []).length === 0)) {
    for (let i = 1; i < pipeline.stages.length; i++) {
      const prev = pipeline.stages[i - 1];
      const current = pipeline.stages[i];
      lines.push(`  ${mermaidNodeId(prev.id)} -.-> ${mermaidNodeId(current.id)}`);
    }
    lines.push('');
    lines.push('  %% Dotted edges show file order only — add explicit needs: in pipeline.yml');
  }

  return lines.join('\n');
}
