# Cross-repo pipeline tutorial

Run ordered stages across two GitHub repositories using `repo:` with either `repo_tokens_json` or GitHub App credentials.

## When you need this

Use cross-repo dispatch when a stage workflow must run in another repository (shared infra, org templates, deployment targets) but you still want **one pipeline file** and explicit stage order on the host repo.

Same-repo pipelines only need `github_token: ${{ github.token }}`.

## Prerequisites

- [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) entry workflow on the **host** repo
- Callable `workflow_dispatch` workflow on the **target** repo
- PAT or GitHub App token with **`actions: write`** on the target (and read access to workflows/runs)

> `GITHUB_TOKEN` in the host repo cannot dispatch workflows in another repo. Use `repo_tokens_json` or a GitHub App installation token path.

## Step 1 — Target workflow

In the target repository, add a callable workflow (see [examples/cross-repo-dispatch/target/.github/workflows/echo.yml](../../examples/cross-repo-dispatch/target/.github/workflows/echo.yml)).

## Step 2 — Host pipeline

```yaml
# .github/pipelines/pipeline.yml
version: 2
companion_workflows:
  - .github/workflows/release.yml
pipelines:
  deploy:
    stages:
      - id: ci
        workflow: .github/workflows/ci.yml

      - id: remote-gate
        needs: [ci]
        repo: my-org/shared-gate-repo
        workflow: .github/workflows/gate.yml
        outputs:
          - approved
```

## Step 3 — Wire secrets in the entry workflow

```yaml
- uses: aeswibon/pipeline-compose-run@v1.4.0
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    github_token: ${{ github.token }}
    repo_tokens_json: >
      {"my-org/shared-gate-repo":"${{ secrets.REMOTE_DISPATCH_TOKEN }}"}
```

GitHub resolves `${{ secrets.* }}` before the action runs; the action receives plain JSON.

GitHub App alternative:

```yaml
- uses: aeswibon/pipeline-compose-run@v1.5.0
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    github_token: ${{ github.token }}
    github_app_id: ${{ secrets.PIPELINE_APP_ID }}
    github_app_private_key: ${{ secrets.PIPELINE_APP_PRIVATE_KEY }}
```

## Step 4 — Validate locally

```bash
pnpm run validate .github/pipelines/pipeline.yml --strict \
  --repo-tokens-file repo-tokens.json
```

`repo-tokens.json` lists slugs only (placeholder values for local validate):

```json
{ "my-org/shared-gate-repo": "placeholder" }
```

Strict mode errors on `stage.cross-repo-token` when a `repo:` slug is external and not listed.

## Step 5 — Manual smoke (maintainers)

The meta repo provides [`.github/workflows/smoke-cross-repo.yml`](../../.github/workflows/smoke-cross-repo.yml) (`workflow_dispatch`). Requires:

- Secret `CROSS_REPO_SMOKE_TOKEN`
- Target repo `aeswibon/pipeline-compose-smoke-target` with `.github/workflows/echo.yml`

Run before tagging a release that touches cross-repo dispatch.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `repo_tokens_json has no entry for that slug` | Add slug to JSON map or configure GitHub App credentials |
| 403 cross-repo error | PAT missing `actions: write` or app not installed on target repo |
| Stage skipped unexpectedly | Check `when:` and upstream `needs:` / skipped dependents |

---

## Case study: manga-cdc

**Before:** release logic split across `sync-version-on-tag` → `test-and-build` → `deploy`, chained with `workflow_run`, duplicated tag guards, and API re-checks for image tags.

**After:** one `.github/pipelines/pipeline.yml` and `pipeline-compose-run` dispatches each stage in order, passing outputs via `context.*` instead of re-fetching from prior workflow runs.

Benefits observed:

- Removed implicit `workflow_run` coupling between deploy and build workflows
- Single place for stage order and `when:` guards
- Context forwarded as dispatch inputs (`image_tag`, `version`, etc.)

Cross-repo stages are only needed if a stage must run in a different repository; manga-cdc same-repo migration uses `github.token` only.

See [examples/run-tag-release](../examples/run-tag-release/) for same-repo tag release pattern.
