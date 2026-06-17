# PR bot example

Portable **pull-request comment** workflow: validates `.github/pipelines/pipeline.yml` on PRs that touch pipeline files and posts (or updates) a Mermaid topology + simulation table.

Based on the meta repo’s [pipeline-pr-comment.yml](../../.github/workflows/pipeline-pr-comment.yml), but checks out [pipeline-compose](https://github.com/aeswibon/pipeline-compose) at a release tag so you can copy this folder without vendoring the CLI.

## Copy into your repo

1. Copy `.github/workflows/pipeline-pr-comment.yml` and `.github/pipelines/pipeline.yml` (adjust paths if needed).
2. Ensure `companion_workflows` lists every workflow referenced by stages.
3. Bump the `ref:` on the `pipeline-compose` checkout when you want newer validate features.

## Permissions

The workflow needs `pull-requests: write` to post comments. Pipeline validation is read-only.

## Local check

```bash
pnpm exec tsx path/to/pipeline-compose/packages/cli/src/main.ts validate \
  .github/pipelines/pipeline.yml --repo-root . --workflows --strict
```

## Customize

- Change `on.pull_request.paths` to match your pipeline layout.
- Add `--check-repo-access` in CI when `repo:` stages are present and `GITHUB_TOKEN` can read targets.

The workflow runs **one** `validate --json --mermaid --simulate` invocation (mermaid is in the JSON `mermaid` field).
