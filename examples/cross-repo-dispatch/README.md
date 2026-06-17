# Cross-repo dispatch example

Host repository runs a pipeline stage that dispatches a workflow in a **target** repository.

## Layout

| Repo | Role |
|------|------|
| **Host** (this example) | Defines pipeline + entry workflow; holds `REMOTE_DISPATCH_TOKEN` secret |
| **Target** | Callable workflow only — copy `target/.github/workflows/cross-repo-echo.yml` into your target repo |

## Host setup

1. Create a fine-grained PAT (or classic PAT) with **Actions: Read and write** on the target repo.
2. Add repository secret `REMOTE_DISPATCH_TOKEN`.
3. Copy `.github/workflows/release.yml` and `.github/pipelines/pipeline.yml`.
4. Adjust `repo:` slug and `repo_tokens_json` keys to match your target.

## Validate

```bash
pnpm run validate .github/pipelines/pipeline.yml \
  --repo-root examples/cross-repo-dispatch \
  --workflows \
  --strict \
  --repo-tokens-file examples/cross-repo-dispatch/repo-tokens.example.json \
  --policy examples/cross-repo-dispatch/validate-policy.json
```

`validate-policy.json` waives cross-repo advisory codes when running `--strict` locally.

The host repo includes `.github/workflows/cross-repo-echo.yml` as a **validate stub** (same shape as `target/.github/workflows/cross-repo-echo.yml`). Install the target copy in the remote repository for real dispatch.

Cross-repo stages emit `stage.cross-repo` warnings by design; this example uses `--workflows` without `--strict` so CI can enforce file presence and export steps without treating dispatch hints as errors.

## Target workflow

See `target/.github/workflows/cross-repo-echo.yml` — install at `.github/workflows/cross-repo-echo.yml` in the target repository with `workflow_call` + `workflow_dispatch` triggers.
