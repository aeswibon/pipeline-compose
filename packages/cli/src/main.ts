#!/usr/bin/env tsx
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  evaluateExpression,
  generateWorkflow,
  loadPipeline,
  validatePipeline,
} from '@aeswibon/pipeline-compose-core';

function compileUsage(): never {
  console.error(
    'Usage: pipeline-compose compile <pipeline.yml> [-o <workflow.yml>] [--check] [--compile-action <ref>] [--workflow-output <path>] [--default-branch <branch>]',
  );
  process.exit(1);
}

function evalUsage(): never {
  console.error(
    'Usage: pipeline-compose eval --expression <expr> [--context <json>] [--github <json>]',
  );
  process.exit(1);
}

function rootUsage(): never {
  console.error('Usage: pipeline-compose <compile|eval> ...');
  process.exit(1);
}

function parseJsonObject(label: string, raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${label} JSON: ${message}`);
  }
}

function runCompile(args: string[]): void {
  let output = '';
  let check = false;
  let compileAction = '';
  let workflowOutput = '';
  let defaultBranch = '';
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o') {
      output = args[++i] ?? '';
    } else if (args[i] === '--check') {
      check = true;
    } else if (args[i] === '--compile-action') {
      compileAction = args[++i] ?? '';
    } else if (args[i] === '--workflow-output') {
      workflowOutput = args[++i] ?? '';
    } else if (args[i] === '--default-branch') {
      defaultBranch = args[++i] ?? '';
    } else {
      positional.push(args[i]);
    }
  }

  const pipelineFile = positional[0];
  if (!pipelineFile) {
    compileUsage();
  }

  const fileYaml = fs.readFileSync(pipelineFile, 'utf8');
  const pipeline = validatePipeline(loadPipeline({ fileYaml }));
  const generated = generateWorkflow(pipeline, {
    pipelineFile,
    workflowOutput: workflowOutput || output || undefined,
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
}

function runEval(args: string[]): void {
  let expression = '';
  let contextJson = '{}';
  let githubJson = '{}';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--expression' || args[i] === '-e') {
      expression = args[++i] ?? '';
    } else if (args[i] === '--context') {
      contextJson = args[++i] ?? '{}';
    } else if (args[i] === '--github') {
      githubJson = args[++i] ?? '{}';
    } else {
      evalUsage();
    }
  }

  if (!expression) {
    evalUsage();
  }

  const context = parseJsonObject('context', contextJson);
  const github = parseJsonObject('github', githubJson);
  const result = evaluateExpression(expression, { context, github });

  console.log(String(result));
}

const [command, ...rest] = process.argv.slice(2);

if (command === 'compile') {
  runCompile(rest);
} else if (command === 'eval') {
  runEval(rest);
} else {
  rootUsage();
}
