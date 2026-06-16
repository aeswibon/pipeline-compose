import * as core from '@actions/core';
import type { StageResult } from './orchestrator.js';

export function writePipelineRunSummary(
  pipelineName: string,
  results: StageResult[],
): void {
  if (!core.summary) {
    return;
  }

  const reused = results.filter((result) => result.reused);
  const skipped = results.filter((result) => result.skipped);
  const lines = [
    `## Pipeline: ${pipelineName}`,
    '',
    '| Stage | Outcome |',
    '| --- | --- |',
    ...results.map((result) => {
      let outcome = 'dispatched';
      if (result.reused) {
        outcome = 'reused (smart rerun)';
      } else if (result.skipped) {
        outcome = 'skipped';
      }
      return `| \`${result.stageId}\` | ${outcome} |`;
    }),
  ];

  if (reused.length > 0) {
    lines.push(
      '',
      `**Smart rerun:** reused **${reused.length}** of **${results.length}** stage(s) on this attempt (skipped re-dispatch).`,
    );
  }
  if (skipped.length > 0) {
    lines.push(`**Skipped:** ${skipped.length} stage(s) (\`when:\` or blocked upstream).`);
  }

  core.summary.addRaw(lines.join('\n'));
}
