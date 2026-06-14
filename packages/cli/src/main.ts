#!/usr/bin/env tsx
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildSyncPlan,
  buildValidateReport,
  evaluateExpression,
  formatValidateReport,
  generateWorkflow,
  loadPipelineDocumentFromFile,
  loadPipelineDocumentsFromInputs,
  runWorkflowSync,
  validatePipelineDocument,
  validatePipelineDocuments,
  validateReportExitCode,
  type ResolvedPipeline,
} from '@aeswibon/pipeline-compose-core';

function compileUsage(): never {
  console.error(
    'Usage: pipeline-compose compile <pipeline.yml|pipeline-dir> [-o <workflow.yml>] [--check] [--compile-action <ref>] [--workflow-output <path>] [--default-branch <branch>]',
  );
  process.exit(1);
}

function evalUsage(): never {
  console.error(
    'Usage: pipeline-compose eval --expression <expr> [--context <json>] [--github <json>]',
  );
  process.exit(1);
}

function validateUsage(): never {
  console.error(
    'Usage: pipeline-compose validate <pipeline.yml|pipeline-dir> [--repo-root <path>] [--workflows] [--strict]',
  );
  process.exit(1);
}

function syncUsage(): never {
  console.error(
    'Usage: pipeline-compose sync <pipeline.yml|pipeline-dir> [--repo-root <path>] [--check]',
  );
  process.exit(1);
}

function rootUsage(): never {
  console.error('Usage: pipeline-compose <compile|eval|validate|sync> ...');
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

function resolveRepoRoot(explicit: string | undefined): string {
  return path.resolve(explicit ?? process.cwd());
}

function loadResolvedPipeline(target: string): ResolvedPipeline {
  const absoluteTarget = path.resolve(target);
  if (fs.statSync(absoluteTarget).isDirectory()) {
    return validatePipelineDocuments(
      loadPipelineDocumentsFromInputs({ pipelineDir: absoluteTarget }),
    );
  }
  return validatePipelineDocument(loadPipelineDocumentFromFile(absoluteTarget));
}

function compileSourceLabel(target: string): string {
  const absoluteTarget = path.resolve(target);
  return fs.statSync(absoluteTarget).isDirectory()
    ? `${absoluteTarget}/`
    : absoluteTarget;
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

  const pipelineTarget = positional[0];
  if (!pipelineTarget) {
    compileUsage();
  }

  const pipeline = loadResolvedPipeline(pipelineTarget);
  const generated = generateWorkflow(pipeline, {
    pipelineFile: compileSourceLabel(pipelineTarget),
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

function runValidate(args: string[]): void {
  let repoRoot = '';
  let workflows = false;
  let strict = false;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root') {
      repoRoot = args[++i] ?? '';
    } else if (args[i] === '--workflows') {
      workflows = true;
    } else if (args[i] === '--strict') {
      strict = true;
    } else {
      positional.push(args[i]);
    }
  }

  const target = positional[0];
  if (!target) {
    validateUsage();
  }

  const resolvedRoot = resolveRepoRoot(repoRoot || undefined);
  const pipeline = loadResolvedPipeline(target);
  const report = buildValidateReport(pipeline, {
    repoRoot: resolvedRoot,
    workflows,
    strict,
  });

  console.log(formatValidateReport(report));
  process.exit(validateReportExitCode(report));
}

function runSync(args: string[]): void {
  let repoRoot = '';
  let check = false;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root') {
      repoRoot = args[++i] ?? '';
    } else if (args[i] === '--check') {
      check = true;
    } else {
      positional.push(args[i]);
    }
  }

  const target = positional[0];
  if (!target) {
    syncUsage();
  }

  const resolvedRoot = resolveRepoRoot(repoRoot || undefined);
  const pipeline = loadResolvedPipeline(target);
  const plan = buildSyncPlan(pipeline, resolvedRoot);

  try {
    const result = runWorkflowSync(plan, resolvedRoot, check);
    if (check) {
      console.log('OK');
      return;
    }
    for (const copied of result.copied) {
      console.log(`Synced ${copied}`);
    }
    for (const skipped of result.skipped) {
      console.log(`Up to date ${skipped}`);
    }
    for (const missing of result.missingSources) {
      console.log(`Missing source ${missing}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const [command, ...rest] = process.argv.slice(2);

if (command === 'compile') {
  runCompile(rest);
} else if (command === 'eval') {
  runEval(rest);
} else if (command === 'validate') {
  runValidate(rest);
} else if (command === 'sync') {
  runSync(rest);
} else {
  rootUsage();
}
