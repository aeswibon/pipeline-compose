# Local development

Guide for working on the **pipeline-compose** monorepo. For using the actions in your repo, see [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run).

## Repository layout

| Path | Package | Role |
|------|---------|------|
| `packages/core/` | `@aeswibon/pipeline-compose-core` | Parser, validator, codegen, expressions, schema |
| `packages/cli/` | `@aeswibon/pipeline-compose-cli` | `pipeline-compose` CLI (`compile`, `eval`, `validate`, `sync`, `init`) |
| `packages/action-run/` | `@aeswibon/pipeline-compose-action-run` | Run action source (published to [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run)) |
| `packages/action-compile/` | `@aeswibon/pipeline-compose-action-compile` | Compile action source |
| `packages/action-eval/` | `@aeswibon/pipeline-compose-action-eval` | Eval action source |
| `packages/action-context-merge/` | `@aeswibon/pipeline-compose-action-context-merge` | Composite context merge action |
| `packages/core/schema/` | — | Pipeline YAML JSON schema |
| `.github/pipelines/pipeline.yml` | — | v2 release pipeline (dogfooded via `pipeline-compose-run` on tag push) |
| `.github/workflows/release.yml` | — | Tag entry workflow — runs `./packages/action-run` against `pipeline.yml` |

Shared logic lives in **`packages/core`**. Action packages depend on it via the pnpm workspace; bundles include core at publish time.

See [docs/action-repos.md](action-repos.md) for how action packages map to GitHub repositories.

See [docs/glossary.md](glossary.md) for the full combined reference (monorepo). Action READMEs include per-action glossaries for end users.

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
| `pnpm run eval` | CLI eval (`--expression`, `--context`, `--github`) |
| `pnpm run validate` | Validate pipeline groups, stages, and optional workflow hygiene |
| `pnpm run init` | Scan `.github/workflows/` and write starter `.github/pipelines/pipeline.yml` |
| `pnpm run sync:workflows` | Sync `workflows/{group}/` sources into flat `.github/workflows/` targets |
| `pnpm run validate … --json` | Machine-readable validate report (for CI dashboards) |
| `pnpm run validate … --mermaid` | Mermaid flowchart of stage topology |
| `pnpm run sync:workflows … --dry-run` | Preview create/update actions without writing files |
| `pnpm run bundle:actions` | Bundle Node actions with `@vercel/ncc` into `packages/action-*/dist` |
| `pnpm run publish:actions [tag]` | Bundle and push action packages locally (CI does this on tag push) |
| `pnpm run lint:workflows` | actionlint + yamllint |
| `pnpm run act:full` | Full local smoke via [act](https://github.com/nektos/act) — tests, validate, eval, compile parity, bundles |
| `pnpm run act:ci` / `act:compile` | Quick act smoke tests |

## Pipeline groups

Pipelines support optional **groups** for organization and ordering:

- **v1** — single pipeline file with root `group:` (inherited by all stages), optional `needs:` (other pipeline `name`s when using multiple files), and `groups:` descriptions.
- **v2** — one file with a `pipelines:` map; each entry has its own `stages` and optional `needs:` referencing other pipeline keys.
- **Multi-file** — put one v1 pipeline per file under `.github/pipelines/`; merge with `pipeline_dir` on the run action or `pipeline-compose validate .github/pipelines`.

Order between pipelines comes from pipeline-level **`needs`**, not from the group label. Within a pipeline, stage order still comes from stage **`needs`**.

```bash
pnpm run validate .github/pipelines/pipeline.yml --workflows
pnpm run sync:workflows .github/pipelines/pipeline.yml --check
```

Sources for sync live at `workflows/{group}/{stage-id}.yml` by convention (override with `workflows/sync.yml`).

### Run-path `when:` expressions

Supported by run and eval (subset of GitHub Actions syntax):

- `startsWith(github.ref, 'refs/tags/v')`
- `contains(github.ref, 'refs/tags/')`
- `github.ref == 'refs/heads/master'`
- `context.<stage>.<output> == 'value'`
- `true` / `false`
- Combine with `&&` and `||` (top-level only; no nested parentheses)

Skipped stages also skip transitive dependents in the run orchestrator.

## Typical workflow

1. Edit shared logic in `packages/core/src/` or action-specific code in `packages/action-*/src/`.
2. Run `pnpm test` and `pnpm run build`.
3. Add `CHANGELOG.md` section (with optional `### pipeline-compose-*` subsections).
4. Push master, tag, and push the tag — CI publishes everything.

Local-only fallback: `pnpm run publish:actions v0.3.1` (requires `gh` and push access to action repos).

CI rebuilds action bundles in the compile-parity job; you do not need committed `dist/` in this repo.

## Releases (meta repo)

Add a `## [X.Y.Z]` section to `CHANGELOG.md` on master before tagging (the release workflow fails without it):

```bash
bash scripts/ci/require-changelog-section.sh 0.3.1   # optional local check
git push origin master
git tag v0.3.1 && git push origin v0.3.1
```

Tag push runs `.github/workflows/release.yml`: **ci → version-sync → release-publish → publish-actions**.

Version sync updates all workspace `package.json` files and `@v` refs in action README usage blocks (`packages/action-*/README.md`). It does **not** bump pins in `examples/` or tutorials — those stay on stable demo versions.

**Do not bump `package.json` locally** for a new release. Merge changes with the current release version (e.g. `0.3.2`); on `git push origin v0.3.3`, CI version-sync rewrites all workspace versions and retags.

Configure repository secret `ACTION_PUBLISH_TOKEN` before the first tag release (see [docs/action-repos.md](action-repos.md)).

### Cross-repo smoke (manual)

Before tagging releases that touch cross-repo dispatch:

1. Ensure target repo `aeswibon/pipeline-compose-smoke-target` has `.github/workflows/echo.yml` (callable).
2. Set secret `CROSS_REPO_SMOKE_TOKEN` (PAT with `actions: write` on the target).
3. Run **Actions → Smoke — cross-repo dispatch → Run workflow**.

Pipeline fixture: `.github/pipelines/smoke-cross-repo.yml`.

Quick links: [Release workflow](https://github.com/aeswibon/pipeline-compose/actions/workflows/release.yml) (tag push) · [Publish actions workflow](https://github.com/aeswibon/pipeline-compose/actions/workflows/publish-actions.yml) (manual)

## CI

| Job | Checks |
|-----|--------|
| `unit-tests` | vitest + TypeScript |
| `compile-action-parity` | CLI vs bundled compile action in `packages/action-compile` |
| `workflow-lint` | actionlint + yamllint |

## Related

- [README](../README.md) — monorepo overview
- [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) — primary action usage
- [docs/development.md](development.md)
