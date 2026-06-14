# Action repositories

Each GitHub Action is published from its **own repository** with `action.yml` at the repo root (required for GitHub Marketplace). Source for all actions lives in this monorepo under `packages/action-*`.

| GitHub repository | Monorepo package | Role |
|-------------------|------------------|------|
| [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) | `packages/action-run` | Primary runtime orchestrator |
| [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) | `packages/action-compile` | Optional static workflow codegen |
| [pipeline-compose-eval](https://github.com/aeswibon/pipeline-compose-eval) | `packages/action-eval` | `when:` expression evaluation |
| [pipeline-compose-context-merge](https://github.com/aeswibon/pipeline-compose-context-merge) | `packages/action-context-merge` | Composite context merge helper |

This repo (**pipeline-compose**) is the single development surface: shared core, CLI, action sources, schema, docs, and release workflows.

## Publish from the monorepo

After changing action or core logic:

```bash
pnpm test
pnpm run build
pnpm run publish:actions v0.3.0
```

`scripts/publish-action-packages.sh` bundles each Node action (inlining `@aeswibon/pipeline-compose-core`), copies `action.yml` and `dist/`, then force-pushes to the matching GitHub repo and tags.

Requires the [GitHub CLI](https://cli.github.com/) (`gh`) authenticated with push access to `aeswibon/pipeline-compose-*`.

## GitHub Marketplace

Publish from each action repo’s **Releases** page (check **Publish this Action to the GitHub Marketplace**). Tags must exist on the action repo (`pnpm run publish:actions` creates them).

## Consumer refs

```yaml
uses: aeswibon/pipeline-compose-run@v0.3.0
```

| Action | Ref |
|--------|-----|
| Run | `aeswibon/pipeline-compose-run@…` |
| Compile | `aeswibon/pipeline-compose-compile@…` |
| Eval | `aeswibon/pipeline-compose-eval@…` |
| Context merge | `aeswibon/pipeline-compose-context-merge@…` |

### Migration from monorepo paths (v0.1.0)

```yaml
# before
uses: aeswibon/pipeline-compose/run@v0.1.0

# after
uses: aeswibon/pipeline-compose-run@v0.1.0
```

Legacy split with sibling directories (`../pipeline-compose-run`, etc.) is no longer used — edit and publish from this monorepo only.
