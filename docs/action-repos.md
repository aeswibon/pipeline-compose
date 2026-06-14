# Action repositories

Each GitHub Action is published from its **own repository** with `action.yml` at the repo root (required for GitHub Marketplace).

| Repository | Directory (local) | Role |
|------------|-------------------|------|
| [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) | `../pipeline-compose-run` | Primary runtime orchestrator |
| [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) | `../pipeline-compose-compile` | Optional static workflow codegen |
| [pipeline-compose-eval](https://github.com/aeswibon/pipeline-compose-eval) | `../pipeline-compose-eval` | `when:` expression evaluation |
| [pipeline-compose-context-merge](https://github.com/aeswibon/pipeline-compose-context-merge) | `../pipeline-compose-context-merge` | Composite context merge helper |

This repo (**pipeline-compose**) contains the CLI, schema, docs, and release workflows.

## Regenerate local action repos

After changing shared logic, re-scaffold siblings from this repo:

```bash
pnpm run create-action-repos
```

Then copy/commit/bundle in each action repo as needed.

## First-time publish

Create empty public GitHub repos, then from each local directory:

```bash
cd ../pipeline-compose-run
git remote add origin git@github.com:aeswibon/pipeline-compose-run.git
git add -A && git commit -m "Initial pipeline-compose-run action."
git push -u origin master
git tag v0.1.0 && git push origin v0.1.0
```

Repeat for `pipeline-compose-compile`, `pipeline-compose-eval`, and `pipeline-compose-context-merge`.

Publish to GitHub Marketplace from each repo’s **Releases** page (check **Publish this Action to the GitHub Marketplace**).

## Consumer migration

Old monorepo refs:

```yaml
uses: aeswibon/pipeline-compose/run@v0.1.0
```

New refs:

```yaml
uses: aeswibon/pipeline-compose-run@v0.1.0
```

| Old | New |
|-----|-----|
| `aeswibon/pipeline-compose/run@…` | `aeswibon/pipeline-compose-run@…` |
| `aeswibon/pipeline-compose/compile@…` | `aeswibon/pipeline-compose-compile@…` |
| `aeswibon/pipeline-compose/eval@…` | `aeswibon/pipeline-compose-eval@…` |
| `aeswibon/pipeline-compose/context/merge@…` | `aeswibon/pipeline-compose-context-merge@…` |

## Development in an action repo

```bash
cd ../pipeline-compose-run
pnpm install
pnpm test
pnpm run bundle   # writes dist/ — commit after logic changes
```

Each Node action bundles its dependencies with `@vercel/ncc`. Commit `dist/` so consumers do not need a build step.
