import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  generateWorkflow,
  loadPipeline,
  loadPipelineDocumentFromFile,
  loadPipelineDocumentsFromInputs,
  validatePipelineDocument,
  validatePipelineDocuments,
} from '@aeswibon/pipeline-compose-core';

function loadResolvedPipeline(opts: {
  pipelineFile?: string;
  pipelineDir?: string;
  inlineYaml?: string;
}) {
  if (opts.pipelineDir) {
    if (opts.inlineYaml?.trim()) {
      throw new Error('pipeline_inline is only supported with pipeline_file');
    }
    const docs = loadPipelineDocumentsFromInputs({ pipelineDir: opts.pipelineDir });
    return {
      pipeline: validatePipelineDocuments(docs),
      pipelineFile: `${path.resolve(opts.pipelineDir)}/`,
    };
  }
  if (!opts.pipelineFile) {
    throw new Error('pipeline_file or pipeline_dir is required');
  }
  const fileYaml = fs.readFileSync(opts.pipelineFile, 'utf8');
  return {
    pipeline: validatePipelineDocument(
      loadPipeline({ fileYaml, inlineYaml: opts.inlineYaml }),
    ),
    pipelineFile: opts.pipelineFile,
  };
}

async function run(): Promise<void> {
  const pipelineFile = core.getInput('pipeline_file', { required: false });
  const pipelineDir = core.getInput('pipeline_dir', { required: false });
  const pipelineInline = core.getInput('pipeline_inline') || '';
  const outputPath = core.getInput('output') || '';
  const check = core.getInput('check') === 'true';
  const workflowOutput = core.getInput('workflow_output') || undefined;
  const compileAction = core.getInput('compile_action') || undefined;
  const defaultBranch = core.getInput('default_branch') || undefined;

  if (!pipelineFile && !pipelineDir) {
    throw new Error('pipeline_file or pipeline_dir input is required');
  }
  if (pipelineFile && pipelineDir) {
    throw new Error('Specify pipeline_file or pipeline_dir, not both');
  }

  const { pipeline, pipelineFile: sourceLabel } = loadResolvedPipeline({
    pipelineFile: pipelineFile || undefined,
    pipelineDir: pipelineDir || undefined,
    inlineYaml: pipelineInline,
  });

  const generated = generateWorkflow(pipeline, {
    pipelineFile: sourceLabel,
    workflowOutput: workflowOutput || outputPath || undefined,
    compileAction,
    defaultBranch,
  });

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
        `Generated workflow is stale. Run: pipeline-compose compile ${sourceLabel} -o ${outputPath}`,
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
