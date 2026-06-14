#!/usr/bin/env tsx
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadPipeline } from '../src/compile/parser.js';
import { validatePipeline } from '../src/compile/validator.js';
import { generateWorkflow } from '../src/compile/codegen.js';

function usage(): never {
  console.error('Usage: pipeline-compose compile <pipeline.yml> [-o <output.yml>] [--check]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args[0] !== 'compile') {
  usage();
}

let output = '';
let check = false;
const positional: string[] = [];

for (let i = 1; i < args.length; i++) {
  if (args[i] === '-o') {
    output = args[++i] ?? '';
  } else if (args[i] === '--check') {
    check = true;
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
const generated = generateWorkflow(pipeline);

if (check) {
  if (!output || !fs.existsSync(output)) {
    console.error('Check mode requires -o and an existing output file');
    process.exit(1);
  }
  if (fs.readFileSync(output, 'utf8') !== generated) {
    console.error('Stale generated workflow');
    process.exit(1);
  }
  console.log('OK');
} else if (!output) {
  process.stdout.write(generated);
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, generated);
  console.log(`Wrote ${output}`);
}
