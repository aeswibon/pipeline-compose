#!/usr/bin/env tsx
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildValidateReport,
  buildSyncPlan,
  evaluateExpression,
  formatSimulateReport,
  formatValidateReport,
  formatWorkflowSyncPreview,
  generateWorkflow,
  loadPipelineDocumentFromFile,
  loadPipelineDocumentsFromInputs,
  previewWorkflowSync,
  renderPipelineMermaid,
  runWorkflowSync,
  serializeValidateReport,
  simulatePipeline,
  validatePipelineDocument,
  validatePipelineDocumentForReport,
  validatePipelineDocuments,
  validatePipelineDocumentsForReport,
  validateReportExitCode,
  writeInitPipeline,
  collectDocumentCatalogIssues,
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
    'Usage: pipeline-compose validate <pipeline.yml|pipeline-dir> [--repo-root <path>] [--workflows] [--strict] [--json] [--mermaid] [--simulate] [--github <json>] [--repo-tokens-file <path>]',
  );
  process.exit(1);
}

function initUsage(): never {
  console.error(
    'Usage: pipeline-compose init [--repo-root <path>] [--output <path>] [--name <pipeline-name>] [--force]',
  );
  process.exit(1);
}

function syncUsage(): never {
  console.error(
    'Usage: pipeline-compose sync <pipeline.yml|pipeline-dir> [--repo-root <path>] [--check] [--dry-run]',
  );
  process.exit(1);
}

function rootUsage(): never {
  console.error('Usage: pipeline-compose <compile|eval|validate|sync|init> ...');
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

function loadResolvedPipelineForValidate(target: string): ResolvedPipeline {
  const absoluteTarget = path.resolve(target);
  if (fs.statSync(absoluteTarget).isDirectory()) {
    return validatePipelineDocumentsForReport(
      loadPipelineDocumentsFromInputs({ pipelineDir: absoluteTarget }),
    );
  }
  return validatePipelineDocumentForReport(loadPipelineDocumentFromFile(absoluteTarget));
}

function loadCatalogIssuesForValidate(target: string) {
  const absoluteTarget = path.resolve(target);
  if (fs.statSync(absoluteTarget).isDirectory()) {
    return loadPipelineDocumentsFromInputs({ pipelineDir: absoluteTarget }).flatMap(
      collectDocumentCatalogIssues,
    );
  }
  return collectDocumentCatalogIssues(loadPipelineDocumentFromFile(absoluteTarget));
}

function compileSourceLabel(target: string): string {
  const absoluteTarget = path.resolve(target);
  if (fs.statSync(absoluteTarget).isDirectory()) {
    return `${target.replace(/\/$/, '')}/`;
  }
  return target;
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
  let json = false;
  let mermaid = false;
  let simulate = false;
  let githubJson = '';
  let repoTokensFile = '';
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root') {
      repoRoot = args[++i] ?? '';
    } else if (args[i] === '--workflows') {
      workflows = true;
    } else if (args[i] === '--strict') {
      strict = true;
    } else if (args[i] === '--json') {
      json = true;
    } else if (args[i] === '--mermaid') {
      mermaid = true;
    } else if (args[i] === '--simulate') {
      simulate = true;
    } else if (args[i] === '--github') {
      githubJson = args[++i] ?? '';
    } else if (args[i] === '--repo-tokens-file') {
      repoTokensFile = args[++i] ?? '';
    } else {
      positional.push(args[i]);
    }
  }

  const target = positional[0];
  if (!target) {
    validateUsage();
  }

  const resolvedRoot = resolveRepoRoot(repoRoot || undefined);
  const pipeline = loadResolvedPipelineForValidate(target);
  const catalogIssues = loadCatalogIssuesForValidate(target);
  let repoTokenSlugs: Set<string> | undefined;
  if (repoTokensFile) {
    const raw = fs.readFileSync(path.resolve(repoTokensFile), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, string>;
    repoTokenSlugs = new Set(Object.keys(parsed));
  }

  const report = buildValidateReport(pipeline, {
    repoRoot: resolvedRoot,
    workflows,
    strict,
    defaultRepo: process.env.GITHUB_REPOSITORY,
    repoTokenSlugs,
    extraIssues: catalogIssues,
  });

  const simulation = simulate
    ? simulatePipeline(report.pipeline, {
        github: githubJson ? parseJsonObject('github', githubJson) : undefined,
      })
    : undefined;

  if (mermaid && json) {
    console.log(renderPipelineMermaid(report.pipeline, { issues: report.issues }));
    console.log('');
    console.log(serializeValidateReport(report, simulation));
    process.exit(validateReportExitCode(report));
  }

  if (mermaid) {
    console.log(renderPipelineMermaid(report.pipeline, { issues: report.issues }));
    process.exit(validateReportExitCode(report));
  }

  if (json) {
    console.log(serializeValidateReport(report, simulation));
    process.exit(validateReportExitCode(report));
  }

  const text = formatValidateReport(report);
  if (simulation) {
    console.log(text);
    console.log('');
    console.log(formatSimulateReport(simulation));
  } else {
    console.log(text);
  }
  process.exit(validateReportExitCode(report));
}

function runInit(args: string[]): void {
  let repoRoot = '';
  let output = '';
  let pipelineName = 'pipeline';
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root') {
      repoRoot = args[++i] ?? '';
    } else if (args[i] === '--output') {
      output = args[++i] ?? '';
    } else if (args[i] === '--name') {
      pipelineName = args[++i] ?? 'pipeline';
    } else if (args[i] === '--force') {
      force = true;
    } else {
      initUsage();
    }
  }

  const resolvedRoot = resolveRepoRoot(repoRoot || undefined);

  try {
    const { outputPath, result } = writeInitPipeline(resolvedRoot, {
      outputPath: output || undefined,
      pipelineName,
      force,
    });
    console.log(`Wrote ${path.relative(resolvedRoot, outputPath)} (${result.stages.length} stage(s))`);
    if (result.skipped.length > 0) {
      console.log('');
      console.log('Skipped workflows:');
      for (const entry of result.skipped) {
        console.log(`  - ${entry}`);
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function runSync(args: string[]): void {
  let repoRoot = '';
  let check = false;
  let dryRun = false;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root') {
      repoRoot = args[++i] ?? '';
    } else if (args[i] === '--check') {
      check = true;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
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

  if (dryRun) {
    console.log(formatWorkflowSyncPreview(previewWorkflowSync(plan, resolvedRoot)));
    return;
  }

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
} else if (command === 'init') {
  runInit(rest);
} else {
  rootUsage();
}
