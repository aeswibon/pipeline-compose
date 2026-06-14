# Local development

Guide for working on the **pipeline-compose** repository itself — building actions, running tests, and dogfooding the compile workflow.

For using the action in your own repo, see the [README](../README.md).

## Prerequisites

- Node.js 24+
- [pnpm](https://pnpm.io/) 10+
- Optional: [Docker](https://docs.docker.com/get-docker/) + [act](https://github.com/nektos/act) for workflow smoke tests

## Install

```bash
pnpm install
```

If `pnpm test` fails with an esbuild platform error (e.g. Linux binaries on macOS), reinstall on your machine:

```bash
rm -rf node_modules && pnpm install
```

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm test` | Unit tests (vitest) |
| `pnpm run build` | Typecheck + bundle `compile/` and `eval/` actions |
| `pnpm run bundle` | Bundle actions only (`ncc` → `compile/dist`, `eval/dist`) |
| `pnpm run lint:workflows` | actionlint + yamllint on workflow YAML |
| `pnpm run verify:bundles` | Assert bundled action artifacts exist |
| `pnpm run act:ci` | Local act smoke for unit-test workflow |
| `pnpm run act:compile` | Local act smoke for compile action |

## Compile CLI

```bash
pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/pipeline.yml

pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/pipeline.yml \
  -o .github/workflows/pipeline.generated.yml

pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/pipeline.yml \
  -o .github/workflows/pipeline.generated.yml \
  --check
```

After changing compiler code, run `pnpm run build` before `./compile` in workflows or act.

## Bundled actions

GitHub Actions load committed bundles, not TypeScript source:

| Path | Role |
|------|------|
| `compile/action.yml` + `compile/dist/` | Compile pipeline YAML → workflow |
| `eval/action.yml` + `eval/dist/` | Evaluate `when:` expressions (subset) |
| `context/merge/action.yml` | Merge stage outputs into context JSON |

Commit updated `*/dist/` after logic changes (`pnpm run build`).

## Dogfooding in this repo

| Path | Role |
|------|------|
| `.github/pipelines/pipeline.yml` | Canonical pipeline (version-sync → release-publish) |
| `.github/workflows/pipeline.generated.yml` | Committed compiled graph |
| `.github/workflows/pipeline.yml` | Runner — uses `./compile` locally (not `@master`) |
| `.github/workflows/ci.yml` | Unit tests, compile parity, freshness check, workflow lint |

Release flow:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

## act smoke tests

Act workflows live under `.github/act/` and use `workflow_dispatch` only — they do not run on GitHub push/PR.

```bash
export ACT_DOCKER_SOCKET="${HOME}/.orbstack/run/docker.sock"   # or your Docker socket
pnpm run act:ci
pnpm run act:compile
```

See [.github/act/README.md](../.github/act/README.md) for inputs and guardrails.

## CI on GitHub

| Job | Checks |
|-----|--------|
| `unit-tests` | vitest + bundle |
| `compile-action-parity` | CLI output matches `./compile` action |
| `compile-pipeline-freshness` | `pipeline.generated.yml` matches `pipeline.yml` |
| `workflow-lint` | actionlint + yamllint |

## Schema

Pipeline v1 schema: [`schema/pipeline-v1.schema.json`](../schema/pipeline-v1.schema.json)

## Related docs

- [README](../README.md) — consumer setup and compile action usage
- [docs/examples.md](examples.md) — extended examples and troubleshooting
