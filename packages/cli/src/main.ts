#!/usr/bin/env tsx
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  buildValidateReport,
  buildSyncPlan,
  collectCrossRepoSlugs,
  collectRepoAccessIssues,
  evaluateExpression,
  formatLocalRunResult,
  formatPipelineState,
  formatSimulateReport,
  formatValidateReport,
  formatWorkflowSyncPreview,
  generateWorkflow,
  listPipelineStates,
  loadPipelineDocumentFromFile,
  loadPipelineDocumentsFromInputs,
  loadPipelineState,
  loadValidatePolicyFromFile,
  parseRerunState,
  previewWorkflowSync,
  renderPipelineMermaid,
  runPipelineLocal,
  runWorkflowSync,
  savePipelineState,
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
  parseRushCommandLine,
  parseTurboTaskGraph,
  renderImportedPipelineYaml,
  renderPipelineHtml,
  buildVisualizeState,
  stagesFromMonorepoTaskGraph,
  type LocalRunResult,
  type PipelineStateRecord,
  type ResolvedPipeline,
  type SimulatePipelineOptions,
  type StageState,
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
  console.error('Usage: pipeline-compose <compile|eval|validate|sync|init|import|local|state|visualize> ...');
  process.exit(1);
}

function importUsage(): never {
  console.error(
    'Usage: pipeline-compose import <turbo|nx|rush> [--config <path>] [--output <path>] [--name <pipeline>] [--workflow-pattern <path>]',
  );
  process.exit(1);
}

function localUsage(): never {
  console.error(
    'Usage: pipeline-compose local <pipeline.yml> [--repo-root <path>] [--act <path>] [--workspace <path>] [--artifact-dir <path>] [--container-image <name>] [--state-dir <path>] [--retry <number>]',
  );
  process.exit(1);
}

function visualizeUsage(): never {
  console.error(
    'Usage: pipeline-compose visualize <pipeline.yml> [--output <path>] [--state-dir <path>] [--run-id <id>] [--open] [--github-summary] [--live]',
  );
  process.exit(1);
}

function stateUsage(): never {
  console.error(
    'Usage: pipeline-compose state <list|show> [<pipeline-name>] [<run-id>] [--state-dir <path>]',
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
  if (tool !== 'turbo' && tool !== 'nx' && tool !== 'rush') {
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

  const defaultConfig =
    tool === 'turbo'
      ? 'turbo.json'
      : tool === 'nx'
        ? 'nx.json'
        : 'common/config/rush/command-line.json';
  const configPath = path.resolve(config || defaultConfig);
  if (!fs.existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown;
  const graph =
    tool === 'turbo'
      ? parseTurboTaskGraph(raw)
      : tool === 'nx'
        ? parseNxTargetDefaults(raw)
        : parseRushCommandLine(raw);
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

function runLocal(args: string[]): void {
  let repoRoot = '';
  let actBinary = '';
  let workspace = '';
  let artifactDir = '';
  let containerImage = '';
  let stateDir = '';
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root') {
      repoRoot = args[++i] ?? '';
    } else if (args[i] === '--act') {
      actBinary = args[++i] ?? '';
    } else if (args[i] === '--workspace') {
      workspace = args[++i] ?? '';
    } else if (args[i] === '--artifact-dir') {
      artifactDir = args[++i] ?? '';
    } else if (args[i] === '--container-image') {
      containerImage = args[++i] ?? '';
    } else if (args[i] === '--state-dir') {
      stateDir = args[++i] ?? '';
    } else {
      positional.push(args[i]);
    }
  }

  const target = positional[0];
  if (!target) {
    localUsage();
  }

  const absoluteTarget = path.resolve(target);
  if (!fs.existsSync(absoluteTarget)) {
    console.error(`Pipeline file not found: ${target}`);
    process.exit(1);
  }

  const pipeline = loadPipelineDocumentFromFile(absoluteTarget);
  const resolved = validatePipelineDocument(pipeline);
  const pipelineName = resolved.name;
  const resolvedRoot = path.resolve(repoRoot || process.cwd());
  const resolvedWorkspace = path.resolve(workspace || '.pipeline-compose/repos');
  const resolvedArtifacts = path.resolve(artifactDir || '.pipeline-compose/artifacts');
  const resolvedStateDir = path.resolve(stateDir || resolvedRoot);

  const result = runPipelineLocal(
    resolved,
    resolvedRoot,
    resolvedWorkspace,
    actBinary || 'act',
    resolvedArtifacts,
    containerImage || 'catthehacker/ubuntu:act-latest',
  );

  console.log(formatLocalRunResult(result));

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  savePipelineState(resolvedStateDir, {
    version: 1,
    pipelineName,
    runId,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    stages: result.stages.map((s) => ({
      id: s.id,
      status: s.status,
      outputs: s.outputs,
      workflow: s.workflow,
      repo: s.repo,
      startedAt: new Date(Date.now() - s.durationMs).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: s.durationMs,
    })),
    success: result.success,
  });

  process.exit(result.success ? 0 : 1);
}

function runState(args: string[]): void {
  let stateDir = '';
  const subcommand = args[0];

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--state-dir') {
      stateDir = args[++i] ?? '';
    }
  }

  const resolvedDir = path.resolve(stateDir || process.cwd());

  if (subcommand === 'list') {
    const pipelineName = args[1] === '--state-dir' ? undefined : args[1];
    const records = listPipelineStates(resolvedDir, pipelineName);
    if (records.length === 0) {
      console.log('No pipeline state records found.');
      return;
    }
    for (const r of records) {
      const date = r.completedAt ?? r.startedAt;
      console.log(`  ${r.pipelineName.padEnd(20)} ${r.runId.padEnd(25)} ${date}  ${r.success ? 'PASS' : 'FAIL'}`);
    }
  } else if (subcommand === 'show') {
    const pipelineName = args[1];
    const runId = args[2];
    if (!pipelineName || !runId) {
      stateUsage();
    }
    const record = loadPipelineState(resolvedDir, pipelineName, runId);
    if (!record) {
      console.error(`State not found: ${pipelineName} / ${runId}`);
      process.exit(1);
    }
    console.log(formatPipelineState(record));
  } else {
    stateUsage();
  }
}

function currentRepo(): string | undefined {
  return process.env.GITHUB_REPOSITORY || undefined;
}

function fetchLiveState(
  pipeline: ResolvedPipeline,
): Record<string, StageState> {
  const state: Record<string, StageState> = {};

  // ponytail: per-(repo,workflow) API call, cached in-memory to avoid duplicates
  const byRepo = new Map<string, Map<string, string>>();
  for (const stage of pipeline.stages) {
    if (!stage.workflow) continue;
    const repo = stage.repo || currentRepo();
    if (!repo) continue;
    if (!byRepo.has(repo)) byRepo.set(repo, new Map());
    byRepo.get(repo)!.set(stage.workflow, stage.id);
  }

  const cache = new Map<string, 'success' | 'failure' | 'running' | 'skipped' | undefined>();

  for (const [repo, workflows] of byRepo) {
    for (const [workflow, stageId] of workflows) {
      const cacheKey = `${repo}::${workflow}`;
      if (cache.has(cacheKey)) {
        const status = cache.get(cacheKey);
        if (status) state[stageId] = { status };
        continue;
      }

      try {
        const raw = execSync(
          `gh api /repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=1 --jq '.workflow_runs[0] | {conclusion, status}'`,
          { encoding: 'utf8', timeout: 10_000, stdio: ['pipe', 'pipe', 'ignore'] },
        );
        const data = JSON.parse(raw.trim() || '{}');
        const conclusion = data.conclusion ?? data.status;
        const status: 'success' | 'failure' | 'running' | 'skipped' =
          conclusion === 'success' ? 'success'
            : conclusion === 'failure' ? 'failure'
              : conclusion === 'cancelled' ? 'skipped'
                : 'running';
        cache.set(cacheKey, status);
        state[stageId] = { status };
      } catch {
        cache.set(cacheKey, undefined);
      }
    }
  }

  const cached = cache.size;
  const fetched = [...cache.entries()].filter(([_, v]) => v !== undefined).length;
  if (fetched > 0) {
    console.error(`  Live state: ${fetched} workflows fetched (${cache.size - fetched} cached)${cached > 0 ? '' : ''}`);
  }

  return state;
}

function runVisualize(args: string[]): void {
  let outputPath = '';
  let stateDir = '';
  let runId = '';
  let openBrowser = false;
  let githubSummary = false;
  let live = false;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output') {
      outputPath = args[++i] ?? '';
    } else if (args[i] === '--state-dir') {
      stateDir = args[++i] ?? '';
    } else if (args[i] === '--run-id') {
      runId = args[++i] ?? '';
    } else if (args[i] === '--open') {
      openBrowser = true;
    } else if (args[i] === '--github-summary') {
      githubSummary = true;
    } else if (args[i] === '--live') {
      live = true;
    } else {
      positional.push(args[i]);
    }
  }

  const target = positional[0];
  if (!target) {
    visualizeUsage();
  }

  const absoluteTarget = path.resolve(target);
  if (!fs.existsSync(absoluteTarget)) {
    console.error(`Pipeline file not found: ${target}`);
    process.exit(1);
  }

  const pipeline = loadPipelineDocumentFromFile(absoluteTarget);
  const resolved = validatePipelineDocument(pipeline);
  const resolvedStateDir = stateDir ? path.resolve(stateDir) : undefined;

  let state;
  if (resolvedStateDir) {
    const records = listPipelineStates(resolvedStateDir, resolved.name);
    state = buildVisualizeState(resolved, records, runId || undefined);
  }

  if (live) {
    const liveState = fetchLiveState(resolved);
    state = { ...liveState, ...state };
  }

  const html = renderPipelineHtml(resolved, { state, title: resolved.name });

  const outPath = path.resolve(outputPath || 'pipeline-visualization.html');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  console.log(`Wrote ${outPath}`);

  if (githubSummary) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) {
      console.error('GITHUB_STEP_SUMMARY not set — not running in GitHub Actions');
      process.exit(1);
    }

    // Build mermaid source with status class defs
    const mermaidLines = renderPipelineMermaid(resolved).split('\n');
    const classDefs: string[] = [];
    const assignments: string[] = [];
    for (const [status, css] of Object.entries({
      success: { fill: '#dafbe1', stroke: '#2da44e' },
      failure: { fill: '#ffebe9', stroke: '#cf222e' },
      skipped: { fill: '#f6f8fa', stroke: '#8b949e' },
      running: { fill: '#ddf4ff', stroke: '#0969da' },
    })) {
      classDefs.push(`  classDef ${status} fill:${css.fill},stroke:${css.stroke},stroke-width:2px`);
    }
    for (const stage of resolved.stages) {
      const s = state?.[stage.id];
      if (s) assignments.push(`  class ${stage.id.replace(/[^a-zA-Z0-9_]/g, '_')} ${s.status}`);
    }
    if (assignments.length > 0) {
      mermaidLines.push('', ...classDefs, ...assignments);
    }

    const summary = [
      '## Pipeline Visualizer',
      '',
      `**${resolved.name}** — ${resolved.stages.length} stages`,
      '',
      '```mermaid',
      ...mermaidLines,
      '```',
      '',
      '### Status',
      '',
      '| Stage | Status |',
      '|---|---|',
    ];
    for (const stage of resolved.stages) {
      const s = state?.[stage.id];
      const icon = s?.status === 'success' ? ':white_check_mark:'
        : s?.status === 'failure' ? ':x:'
        : s?.status === 'skipped' ? ':heavy_minus_sign:'
        : s?.status === 'running' ? ':arrows_counterclockwise:'
        : ':hourglass:';
      const label = stage.workflow ?? stage.run ?? stage.pipeline_file ?? '';
      summary.push(`| **${stage.id}**${label ? `<br>\`${label}\`` : ''} | ${icon} ${s?.status ?? 'pending'} |`);
    }

    fs.appendFileSync(summaryPath, '\n' + summary.join('\n') + '\n');
  }

  if (openBrowser) {
    const platform = process.platform;
    const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    execSync(`${cmd} "${outPath}"`);
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
} else if (command === 'import') {
  runImport(rest);
} else if (command === 'local') {
  runLocal(rest);
} else if (command === 'state') {
  runState(rest);
} else if (command === 'visualize') {
  runVisualize(rest);
} else {
  rootUsage();
}
