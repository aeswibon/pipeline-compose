#!/usr/bin/env tsx
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildValidateReport,
  buildSyncPlan,
  collectCrossRepoSlugs,
  collectRepoAccessIssues,
  evaluateExpression,
  formatSimulateReport,
  formatValidateReport,
  formatWorkflowSyncPreview,
  generateWorkflow,
  loadPipelineDocumentFromFile,
  loadPipelineDocumentsFromInputs,
  loadValidatePolicyFromFile,
  parseRerunState,
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
  parseNxTargetDefaults,
  parseTurboTaskGraph,
  renderImportedPipelineYaml,
  stagesFromMonorepoTaskGraph,
  type ResolvedPipeline,
  type SimulatePipelineOptions,
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
    'Usage: pipeline-compose validate <pipeline.yml|pipeline-dir> [--repo-root <path>] [--workflows] [--strict] [--json] [--mermaid] [--simulate] [--github <json>] [--repo-tokens-file <path>] [--check-repo-access] [--rerun-state <path>] [--policy <path>]',
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
  console.error('Usage: pipeline-compose <compile|eval|validate|sync|init|import> ...');
  process.exit(1);
}

function importUsage(): never {
  console.error(
    'Usage: pipeline-compose import <turbo|nx> [--config <path>] [--output <path>] [--name <pipeline>] [--workflow-pattern <path>]',
  );
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

function loadDocumentsForValidate(target: string) {
  const absoluteTarget = path.resolve(target);
  if (fs.statSync(absoluteTarget).isDirectory()) {
    return loadPipelineDocumentsFromInputs({ pipelineDir: absoluteTarget });
  }
  return [loadPipelineDocumentFromFile(absoluteTarget)];
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
  void runValidateAsync(args).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

async function runValidateAsync(args: string[]): Promise<void> {
  let repoRoot = '';
  let workflows = false;
  let strict = false;
  let json = false;
  let mermaid = false;
  let simulate = false;
  let githubJson = '';
  let repoTokensFile = '';
  let checkRepoAccess = false;
  let rerunStateFile = '';
  let policyFile = '';
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
    } else if (args[i] === '--check-repo-access') {
      checkRepoAccess = true;
    } else if (args[i] === '--rerun-state') {
      rerunStateFile = args[++i] ?? '';
    } else if (args[i] === '--policy') {
      policyFile = args[++i] ?? '';
    } else {
      positional.push(args[i]);
    }
  }

  const target = positional[0];
  if (!target) {
    validateUsage();
  }

  const resolvedRoot = resolveRepoRoot(repoRoot || undefined);
  const documents = loadDocumentsForValidate(target);
  const pipeline = loadResolvedPipelineForValidate(target);
  const catalogIssues = loadCatalogIssuesForValidate(target);
  let repoTokenSlugs: Set<string> | undefined;
  if (repoTokensFile) {
    const raw = fs.readFileSync(path.resolve(repoTokensFile), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, string>;
    repoTokenSlugs = new Set(Object.keys(parsed));
  }

  let report = buildValidateReport(pipeline, {
    repoRoot: resolvedRoot,
    workflows,
    strict,
    defaultRepo: process.env.GITHUB_REPOSITORY,
    repoTokenSlugs,
    extraIssues: catalogIssues,
    documents,
    policy: policyFile ? loadValidatePolicyFromFile(path.resolve(policyFile)) : undefined,
  });

  if (checkRepoAccess) {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN or GH_TOKEN is required for --check-repo-access');
    }
    const accessIssues = await collectRepoAccessIssues(
      collectCrossRepoSlugs(report.pipeline, resolvedRoot),
      token,
    );
    report = {
      pipeline: report.pipeline,
      issues: [...report.issues, ...accessIssues],
    };
  }

  const github = githubJson ? parseJsonObject('github', githubJson) : undefined;

  let smartRerun: SimulatePipelineOptions['smartRerun'];
  if (rerunStateFile) {
    if (!simulate) {
      throw new Error('--rerun-state requires --simulate');
    }
    const raw = fs.readFileSync(path.resolve(rerunStateFile), 'utf8');
    const previousState = parseRerunState(raw);
    if (!previousState) {
      throw new Error(`Invalid rerun state JSON: ${rerunStateFile}`);
    }
    smartRerun = {
      previousState,
      ref: typeof github?.ref === 'string' ? github.ref : undefined,
      runAttempt: 2,
    };
  }

  const simulation = simulate
    ? simulatePipeline(report.pipeline, {
        github,
        repoRoot: resolvedRoot || undefined,
        smartRerun,
      })
    : undefined;

  if (mermaid && json) {
    const mermaidText = renderPipelineMermaid(report.pipeline, { issues: report.issues });
    console.log(serializeValidateReport(report, simulation, { mermaid: mermaidText }));
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
    if (result.dispatchHints.length > 0) {
      console.log('');
      console.log('repository_dispatch migration hints:');
      for (const hint of result.dispatchHints) {
        console.log(`  - ${hint}`);
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

function runImport(args: string[]): void {
  const tool = args[0];
  if (tool !== 'turbo' && tool !== 'nx') {
    importUsage();
  }

  let config = '';
  let output = '';
  let pipelineName = 'monorepo';
  let workflowPattern = '';
  const rest = args.slice(1);

  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--config') {
      config = rest[++i] ?? '';
    } else if (rest[i] === '--output') {
      output = rest[++i] ?? '';
    } else if (rest[i] === '--name') {
      pipelineName = rest[++i] ?? 'monorepo';
    } else if (rest[i] === '--workflow-pattern') {
      workflowPattern = rest[++i] ?? '';
    } else {
      importUsage();
    }
  }

  const configPath = path.resolve(config || (tool === 'turbo' ? 'turbo.json' : 'nx.json'));
  if (!fs.existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown;
  const graph =
    tool === 'turbo' ? parseTurboTaskGraph(raw) : parseNxTargetDefaults(raw);
  const stages = stagesFromMonorepoTaskGraph(graph, {
    workflowPattern: workflowPattern || undefined,
  });
  const yaml = renderImportedPipelineYaml(pipelineName, stages);
  const outputPath = path.resolve(output || '.github/pipelines/imported.yml');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, yaml);
  console.log(`Wrote ${outputPath} (${stages.length} stage(s) from ${tool})`);
  console.log('ponytail: workflow paths are placeholders; add workflows or re-point stages.');
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
} else if (command === 'import') {
  runImport(rest);
} else {
  rootUsage();
}
