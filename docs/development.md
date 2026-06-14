# Local development

Guide for working on the **pipeline-compose** repository. For using the action in your repo, see the [README](../README.md).

## What's in this repository

| Path | Role |
|------|------|
| `run/` | **Primary action** — dispatch stages in order at runtime |
| `compile/` | Optional — emit a static workflow YAML with native `needs:` |
| `eval/` | Expression evaluation for pipeline `when:` |
| `context/merge/` | Merge stage outputs into context JSON |
| `.github/pipelines/pipeline.yml` | Dogfood pipeline (stage order) |
| `.github/workflows/pipeline.yml` | Tag entry workflow using `./run` |
| `.github/workflows/stage-*.yml` | Dispatchable stage workflows |
| `schema/pipeline-v1.schema.json` | Pipeline YAML schema |

Release dogfood:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

## Prerequisites

- Node.js 24+
- [pnpm](https://pnpm.io/) 10+

## Install

```bash
pnpm install
```

If tests fail with an esbuild/rollup platform error, reinstall on your machine:

```bash
rm -rf node_modules && pnpm install
```

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm test` | Unit tests |
| `pnpm run build` | Typecheck + bundle all actions |
| `pnpm run bundle:run` | Bundle `run/` action only |
| `pnpm run lint:workflows` | actionlint + yamllint |

## Bundled actions

GitHub Actions load committed bundles under `*/dist/`, not TypeScript source. After changing action logic:

```bash
pnpm run build
```

Commit updated `run/dist/`, `compile/dist/`, and `eval/dist/` as needed.

## CI

| Job | Checks |
|-----|--------|
| `unit-tests` | vitest + bundle all actions |
| `compile-action-parity` | Optional compile action vs CLI |
| `workflow-lint` | actionlint + yamllint |

## Optional compile action

For advanced use cases that prefer a committed generated workflow and native GitHub `needs:` graphs, see [`compile/action.yml`](../compile/action.yml). Most consumers should use **`run`** only.

## Related

- [README](../README.md) — action usage
- [docs/examples.md](examples.md) — stage contracts, examples, troubleshooting
