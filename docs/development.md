# Local development

Guide for working on the **pipeline-compose** monorepo. For using the actions in your repo, see the [README](../README.md).

## Repository layout

| Path | Package | Role |
|------|---------|------|
| `packages/core/` | `@aeswibon/pipeline-compose-core` | Parser, validator, codegen, expressions, schema |
| `packages/cli/` | `@aeswibon/pipeline-compose-cli` | `pipeline-compose` CLI (`compile`, `eval`) |
| `packages/action-run/` | `@aeswibon/pipeline-compose-action-run` | Run action source (published to [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run)) |
| `packages/action-compile/` | `@aeswibon/pipeline-compose-action-compile` | Compile action source |
| `packages/action-eval/` | `@aeswibon/pipeline-compose-action-eval` | Eval action source |
| `packages/action-context-merge/` | `@aeswibon/pipeline-compose-action-context-merge` | Composite context merge action |
| `packages/core/schema/` | — | Pipeline YAML JSON schema |
| `.github/pipelines/pipeline.yml` | — | Example pipeline (compile parity + docs) |
| `.github/workflows/release.yml` | — | Tag release workflow (native reusable workflows) |

Shared logic lives in **`packages/core`**. Action packages depend on it via the pnpm workspace; bundles include core at publish time.

See [docs/action-repos.md](action-repos.md) for how action packages map to GitHub repositories.

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
| `pnpm test` | Unit tests (vitest across workspace packages) |
| `pnpm run build` | Typecheck + emit `packages/core/dist` |
| `pnpm run compile` | CLI compile (same as `pnpm exec tsx packages/cli/src/main.ts compile …`) |
| `pnpm run bundle:actions` | Bundle Node actions with `@vercel/ncc` into `packages/action-*/dist` |
| `pnpm run publish:actions [tag]` | Bundle and force-push action packages to GitHub (default tag `v0.2.0`) |
| `pnpm run lint:workflows` | actionlint + yamllint |
| `pnpm run act:ci` / `act:compile` | Local [act](https://github.com/nektos/act) smoke tests |

## Typical workflow

1. Edit shared logic in `packages/core/src/` or action-specific code in `packages/action-*/src/`.
2. Run `pnpm test` and `pnpm run build`.
3. If you changed a Node action, run `pnpm run bundle:actions`.
4. Publish updated actions: `pnpm run publish:actions v0.3.0` (requires `gh` CLI and repo access).

CI rebuilds action bundles in the compile-parity job; you do not need committed `dist/` in this repo.

## Releases (meta repo)

Add a `## [X.Y.Z]` section to `CHANGELOG.md` on master before tagging (the release workflow fails without it):

```bash
bash scripts/ci/require-changelog-section.sh 0.3.0   # optional local check
git push origin master
git tag v0.3.0 && git push origin v0.3.0
```

Tag push runs `.github/workflows/release.yml`: **ci → version-sync → release-publish**.

After a meta release that changes action logic, publish matching action tags with `pnpm run publish:actions v0.3.0`.

## CI

| Job | Checks |
|-----|--------|
| `unit-tests` | vitest + TypeScript |
| `compile-action-parity` | CLI vs bundled compile action in `packages/action-compile` |
| `workflow-lint` | actionlint + yamllint |

## Related

- [README](../README.md) — consumer usage
- [docs/action-repos.md](action-repos.md) — action repo mapping and publish flow
- [docs/examples.md](examples.md) — stage contracts, examples, troubleshooting
