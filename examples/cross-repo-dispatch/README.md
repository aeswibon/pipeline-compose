# Cross-repo dispatch example

Host repository runs a pipeline stage that dispatches a workflow in a **target** repository.

## Layout

| Repo | Role |
|------|------|
| **Host** (this example) | Defines pipeline + entry workflow; holds `REMOTE_DISPATCH_TOKEN` secret |
| **Target** | Callable workflow only — copy `target/.github/workflows/echo.yml` into your target repo |

## Host setup

1. Create a fine-grained PAT (or classic PAT) with **Actions: Read and write** on the target repo.
2. Add repository secret `REMOTE_DISPATCH_TOKEN`.
3. Copy `.github/workflows/release.yml` and `.github/pipelines/pipeline.yml`.
4. Adjust `repo:` slug and `repo_tokens_json` keys to match your target.

## Validate

```bash
pnpm run validate .github/pipelines/pipeline.yml \
  --repo-root examples/cross-repo-dispatch \
  --strict \
  --repo-tokens-file examples/cross-repo-dispatch/repo-tokens.example.json
```

## Target workflow

See `target/.github/workflows/echo.yml` — install at `.github/workflows/echo.yml` in the target repository with `workflow_call` + `workflow_dispatch` triggers.
