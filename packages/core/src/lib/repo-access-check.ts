import { isSubPipelineStage, resolveSubPipeline } from '../compile/sub-pipeline.js';
import type { ResolvedPipeline } from '../compile/parser.js';
import { parseRepoSlug } from './expressions.js';
import type { ValidationIssue } from '../compile/validate-report.js';

export function collectCrossRepoSlugs(
  pipeline: ResolvedPipeline,
  repoRoot?: string,
): string[] {
  const slugs = new Set<string>();

  function walk(stages: ResolvedPipeline['stages']): void {
    for (const stage of stages) {
      if (stage.repo) {
        try {
          parseRepoSlug(stage.repo);
          slugs.add(stage.repo);
        } catch {
          // invalid slug reported elsewhere
        }
      }
      if (isSubPipelineStage(stage) && repoRoot) {
        try {
          const nested = resolveSubPipeline(repoRoot, stage.pipeline_file!, stage.pipeline);
          walk(nested.stages);
        } catch {
          // sub-pipeline errors reported elsewhere
        }
      }
    }
  }

  walk(pipeline.stages);
  return [...slugs].sort();
}

export async function collectRepoAccessIssues(
  slugs: string[],
  token: string,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const slug of slugs) {
    const response = await fetch(`https://api.github.com/repos/${slug}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'pipeline-compose-validate',
      },
    });
    if (response.status === 404) {
      issues.push({
        level: 'error',
        code: 'repo.access-denied',
        message: `Cannot access repository ${slug} with provided token (404)`,
      });
    } else if (!response.ok) {
      issues.push({
        level: 'error',
        code: 'repo.access-check-failed',
        message: `GitHub API ${response.status} checking repository ${slug}`,
      });
    }
  }
  return issues;
}
