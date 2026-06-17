# Cross-repo sub-pipeline example

Host repository runs a **`pipeline_file`** stage that expands into an inner DAG with a **cross-repo** leaf stage.

## Layout

| Piece | Role |
|-------|------|
| `pipeline.yml` | Top-level stage `remote-bundle` → `inner.yml` |
| `inner.yml` | Nested graph; `remote-echo` dispatches to target repo |
| **Target** | Install `target/.github/workflows/cross-repo-echo.yml` remotely |

## Why this shape

- **Sub-pipeline** encapsulates a multi-step bundle behind one parent stage id and `context.remote-bundle.*`.
- **Cross-repo** dispatch stays on nested `workflow:` stages (same as [cross-repo-dispatch](../cross-repo-dispatch/)).
- **Smart rerun** fingerprints nested `pipeline_file` content locally and remote workflow YAML via Contents API.

## Host setup

1. PAT or GitHub App with **Actions: Read and write** on the target repo.
2. Secret `REMOTE_DISPATCH_TOKEN` (or App credentials on the run action).
3. Copy `.github/` from this example; adjust `repo:` slug and token map.

## Validate

```bash
pnpm run validate .github/pipelines/pipeline.yml \
  --repo-root examples/cross-repo-subpipeline \
  --workflows \
  --repo-tokens-file examples/cross-repo-subpipeline/repo-tokens.example.json
```

Uses loose validate (no `--strict`) like cross-repo-dispatch so cross-repo hints stay warnings.
