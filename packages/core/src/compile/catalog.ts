import type { PipelineDocument, PipelineStage } from './parser.js';
import { isPipelineV2 } from './parser.js';
import type { ValidationIssue } from './validate-report.js';

/** Reusable stage template (no `id` or `use`). */
export type CatalogEntry = Omit<PipelineStage, 'id' | 'use'>;

export function collectCatalogStageIssues(
  stages: PipelineStage[],
  catalog: Record<string, CatalogEntry> | undefined,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!catalog) {
    return issues;
  }

  for (const [key, entry] of Object.entries(catalog)) {
    if (!entry.workflow && !entry.pipeline_file) {
      issues.push({
        level: 'error',
        code: 'catalog.invalid-entry',
        message: `Catalog entry "${key}" must set workflow or pipeline_file`,
      });
    }
    if (entry.workflow && entry.pipeline_file) {
      issues.push({
        level: 'error',
        code: 'catalog.invalid-entry',
        message: `Catalog entry "${key}" cannot set both workflow and pipeline_file`,
      });
    }
    if ('use' in entry && (entry as PipelineStage).use) {
      issues.push({
        level: 'error',
        code: 'catalog.invalid-entry',
        message: `Catalog entry "${key}" must not set use`,
      });
    }
  }

  for (const stage of stages) {
    if (!stage.use) {
      continue;
    }
    if (!stage.id) {
      issues.push({
        level: 'error',
        code: 'catalog.missing-id',
        message: `Stage with use: "${stage.use}" must set id`,
      });
    }
    if (!catalog[stage.use]) {
      issues.push({
        level: 'error',
        code: 'catalog.unknown',
        message: `Stage "${stage.id ?? stage.use}" references unknown catalog entry "${stage.use}"`,
      });
    }
    if (stage.workflow || stage.pipeline_file) {
      issues.push({
        level: 'error',
        code: 'catalog.conflict',
        message: `Stage "${stage.id}" cannot set use with workflow or pipeline_file`,
      });
    }
  }

  return issues;
}

export function collectDocumentCatalogIssues(doc: PipelineDocument): ValidationIssue[] {
  if (!isPipelineV2(doc)) {
    return collectCatalogStageIssues(doc.stages, doc.catalog);
  }

  const issues: ValidationIssue[] = [];
  for (const def of Object.values(doc.pipelines)) {
    issues.push(...collectCatalogStageIssues(def.stages, doc.catalog));
  }
  return issues;
}

function mergeCatalogStage(stage: PipelineStage, template: CatalogEntry): PipelineStage {
  const { use: _use, ...overrides } = stage;
  return {
    ...template,
    ...overrides,
    id: stage.id,
    inputs: { ...template.inputs, ...overrides.inputs },
    outputs: overrides.outputs ?? template.outputs,
    needs: overrides.needs ?? template.needs,
  };
}

export function expandCatalogStage(stage: PipelineStage, catalog: Record<string, CatalogEntry>): PipelineStage {
  if (!stage.use) {
    return stage;
  }
  const template = catalog[stage.use];
  if (!template) {
    throw new Error(`Stage "${stage.id}" references unknown catalog entry "${stage.use}"`);
  }
  if (stage.workflow || stage.pipeline_file) {
    throw new Error(`Stage "${stage.id}" cannot set use with workflow or pipeline_file`);
  }
  return mergeCatalogStage(stage, template);
}

export function expandCatalogStages(
  stages: PipelineStage[],
  catalog: Record<string, CatalogEntry> | undefined,
  options: { lenientCatalog?: boolean } = {},
): PipelineStage[] {
  if (!catalog) {
    return stages;
  }

  const issues = collectCatalogStageIssues(stages, catalog);
  const hasErrors = issues.some((issue) => issue.level === 'error');
  if (hasErrors && !options.lenientCatalog) {
    const first = issues.find((issue) => issue.level === 'error');
    throw new Error(first?.message ?? 'Invalid catalog reference');
  }

  return stages.map((stage) => {
    if (!stage.use) {
      return stage;
    }
    const template = catalog[stage.use];
    if (!template || stage.workflow || stage.pipeline_file) {
      return stage;
    }
    return mergeCatalogStage(stage, template);
  });
}

export function catalogFromDocument(doc: PipelineDocument): Record<string, CatalogEntry> | undefined {
  if (isPipelineV2(doc)) {
    return doc.catalog;
  }
  return doc.catalog;
}
