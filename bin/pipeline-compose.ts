#!/usr/bin/env tsx
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadPipeline } from '../src/compile/parser.js';
import { validatePipeline } from '../src/compile/validator.js';
import { generateWorkflow } from '../src/compile/codegen.js';

function usage(): never {
  console.error(
    'Usage: pipeline-compose compile <pipeline.yml> [-o <workflow.yml>] [--check] [--compile-action <ref>] [--default-branch <branch>]',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args[0] !== 'compile') {
  usage();
}

let output = '';
let check = false;
let compileAction = '';
let defaultBranch = '';
const positional: string[] = [];

for (let i = 1; i < args.length; i++) {
  if (args[i] === '-o') {
    output = args[++i] ?? '';
  } else if (args[i] === '--check') {
    check = true;
  } else if (args[i] === '--compile-action') {
    compileAction = args[++i] ?? '';
  } else if (args[i] === '--default-branch') {
    defaultBranch = args[++i] ?? '';
  } else {
    positional.push(args[i]);
  }
}

const pipelineFile = positional[0];
if (!pipelineFile) {
  usage();
}

const fileYaml = fs.readFileSync(pipelineFile, 'utf8');
const pipeline = validatePipeline(loadPipeline({ fileYaml }));
const generated = generateWorkflow(pipeline, {
  pipelineFile,
  workflowOutput: output || undefined,
  compileAction: compileAction || undefined,
  defaultBranch: defaultBranch || undefined,
});

const outputPath = output || '.github/workflows/pipeline.yml';

if (check) {
  if (!fs.existsSync(outputPath)) {
    console.error('Check mode requires an existing output file');
    process.exit(1);
  }
  if (fs.readFileSync(outputPath, 'utf8') !== generated) {
    console.error('Stale generated workflow');
    process.exit(1);
  }
  console.log('OK');
} else if (args.includes('-o') || output) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, generated);
  console.log(`Wrote ${outputPath}`);
} else {
  process.stdout.write(generated);
}
