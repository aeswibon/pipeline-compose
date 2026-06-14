# Local development

Guide for working on the **pipeline-compose** repository. For using the action in your repo, see the [README](../README.md).

## What's in this repository

| Path | Role |
|------|------|
| `bin/` | `pipeline-compose` CLI (`compile`, `eval`) |
| `src/compile/` | Pipeline parser, validator, codegen (CLI + shared spec) |
| `schema/` | Pipeline YAML JSON schema |
| `.github/pipelines/pipeline.yml` | Example pipeline (compile parity + docs) |
| `.github/workflows/release.yml` | Tag release workflow (native reusable workflows) |
| `.github/workflows/stage-*.yml` | Release stage workflows |

**Actions** live in separate repos — see [docs/action-repos.md](action-repos.md).

## Releases

Add a `## [X.Y.Z]` section to `CHANGELOG.md` on master before tagging (the release workflow fails without it):

```bash
bash scripts/ci/require-changelog-section.sh 0.2.0   # optional local check
git push origin master
git tag v0.2.0 && git push origin v0.2.0
```

Tag push runs `.github/workflows/release.yml`: **ci → version-sync → release-publish** (native reusable workflows, not the run action).

## Prerequisites

- Node.js 24+
- [pnpm](https://pnpm.io/) 10+

## Install

```bash
pnpm install
```

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm test` | Unit tests (CLI / compile) |
| `pnpm run build` | Typecheck |
| `pnpm run lint:workflows` | actionlint + yamllint |
| `pnpm run create-action-repos` | Scaffold sibling action repositories |

## CI

| Job | Checks |
|-----|--------|
| `unit-tests` | vitest + TypeScript |
| `compile-action-parity` | CLI vs [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) action |
| `workflow-lint` | actionlint + yamllint |

## Optional compile action

For advanced use cases that prefer a committed generated workflow and native GitHub `needs:` graphs, see [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile). Most consumers should use **pipeline-compose-run** only.

## Related

- [README](../README.md) — action usage
- [docs/action-repos.md](action-repos.md) — split action repositories
- [docs/examples.md](examples.md) — stage contracts, examples, troubleshooting
