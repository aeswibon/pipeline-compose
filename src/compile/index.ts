import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadPipeline } from './parser.js';
import { validatePipeline } from './validator.js';
import { generateWorkflow } from './codegen.js';

async function run(): Promise<void> {
  const pipelineFile = core.getInput('pipeline_file', { required: true });
  const pipelineInline = core.getInput('pipeline_inline') || '';
  const outputPath = core.getInput('output') || '';
  const check = core.getInput('check') === 'true';

  const fileYaml = fs.readFileSync(pipelineFile, 'utf8');
  const pipeline = validatePipeline(
    loadPipeline({ fileYaml, inlineYaml: pipelineInline }),
  );
  const generated = generateWorkflow(pipeline);

  if (check) {
    if (!outputPath) {
      throw new Error('output is required when check=true');
    }
    if (!fs.existsSync(outputPath)) {
      core.setFailed(`Missing generated workflow: ${outputPath}`);
      return;
    }
    const existing = fs.readFileSync(outputPath, 'utf8');
    if (existing !== generated) {
      core.setFailed(
        `Generated workflow is stale. Run: pnpm exec pipeline-compose compile ${pipelineFile} -o ${outputPath}`,
      );
      return;
    }
    core.info('Generated workflow is up to date.');
    return;
  }

  if (!outputPath) {
    core.setOutput('workflow_yaml', generated);
    core.info(generated);
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, generated);
  core.setOutput('workflow_path', outputPath);
  core.info(`Wrote ${outputPath}`);
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));
