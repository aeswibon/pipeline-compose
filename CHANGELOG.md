# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Examples and docs** — action pins updated to `@v1.3.0`; compile codegen default pin `@v1.3.0`.

## [1.3.0] - 2026-06-16

### Added

- **`validate` context wiring checks** — `context.unknown-stage` / `context.unknown-output` errors when stage `inputs` reference missing stages or undeclared `outputs`.
- **`validate --simulate` wave grouping** — dry-run table shows DAG waves (parallel stages grouped).

## [1.2.0] - 2026-06-16

### Fixed

- **Dependabot / undici** — upgrade `@actions/artifact` to v6 (pulls `@actions/github` 9.x and `undici` ≥6.24).

### Added

- **Parallel stage dispatch** — `pipeline-compose-run` dispatches stages in the same DAG wave concurrently.
- **Pipeline `concurrency`** — optional `concurrency.group` + `cancel_in_progress` on pipeline YAML; enforced by run action before stages; emitted by compile codegen.

### Changed

- **Concurrency docs** — run vs compile behavior documented in run action README and glossary.
- **Meta pipeline** — `.github/pipelines/pipeline.yml` declares `concurrency` for release runs.
- **1.0 contracts** — 1.2 features documented; later backlog listed.

## [1.1.0] - 2026-06-14

### Added

- **`validate --simulate`** — dry-run stage table using `when:`, upstream skips, and missing context (mirrors run orchestrator skip logic).
- **`validate --github <json>`** — GitHub context for simulation (PR bot passes workflow `github` object).
- **`needs.unknown` validation** — unknown `needs:` targets reported as errors; mermaid marks affected stages.
- **`docs/specs/1.0-contracts.md`** — frozen 1.0 public contracts (schema, CLI, issue codes, CI guarantees).
- **`scripts/ci/validate-examples.sh`** — strict `--workflows` validate for meta repo + all pipeline examples.

### Changed

- **Validate load path** — unknown `needs:` no longer throws at parse time; surfaced in the validate report instead.
- **PR bot** — includes simulation dry-run table alongside topology mermaid and issues.
- **cross-repo-dispatch example** — validate stub `cross-repo-echo.yml` with export step for workflow checks.

## [1.0.0] - 2026-06-14

### Added

- **1.0 GA migration guide** — [docs/migration/v1.0.md](docs/migration/v1.0.md).
- **Mermaid guide** — [docs/mermaid-demo.md](docs/mermaid-demo.md) with PR bot samples [#5](https://github.com/aeswibon/pipeline-compose/pull/5) / [#7](https://github.com/aeswibon/pipeline-compose/pull/7).
- **`validate --mermaid` error styling** — red error nodes and amber blocked-upstream nodes on failed validation.

### Changed

- **Pipeline schema v2 only** — v1 documents rejected at load/validate.
- **Legacy pattern validation** — monorepo action paths, `@master` pins, and manual export uploads are errors (not warnings).
- **`init` / `compile` defaults** — v2 pipeline YAML; compile-check pin `@v1.0.0`.
- **Examples and docs** — all examples migrated to v2; action pins `@v1.0.0`; README trimmed for GA.
- **CI** — strict validate for meta pipeline, run-tag-release, and compile-check examples.

### Removed

- Pipeline schema **v1** support (file format with top-level `stages:`).
- Deprecation warning mode for patterns removed in this release (see [v0.5 migration](docs/migration/v0.5.md)).

### Fixed

- **`findOrphanWorkflows`** — resolve `--repo-root` to an absolute path so orphan detection matches stage/companion references.

## [0.5.0] - 2026-06-14

### Added

- **Migration guide** — [docs/migration/v0.5.md](docs/migration/v0.5.md) for deprecations removed in 1.0.0.
- **`validate` deprecations** — warns on manual export upload, monorepo action paths, `@master` pins, and pipeline schema v1 (`--repo-root`; `--strict` promotes to errors).
- **`schemaVersion`** on resolved pipelines (1 vs 2) for accurate v1 deprecation detection.

### Changed

- **run-tag-release example** — pipeline file migrated to schema v2.
- **CI** — meta-repo validate uses `--repo-root .` for deprecation scans.

## [0.4.3] - 2026-06-14

### Fixed

- **pipeline-compose-export** — pass absolute `outputs.json` path to `@actions/artifact` (relative paths resolved from workspace root, not `rootDirectory`).

## [0.4.2] - 2026-06-14

### Changed

- **Meta-repo** — `stage-version-sync.yml` uses `./packages/action-export` instead of manual `jq` + `upload-artifact`.
- **Examples / docs** — run-tag-release and export docs show `pipeline-compose-export@v0.4.1`.

## [0.4.1] - 2026-06-14

### Added

- **Glossary** — [docs/glossary.md](docs/glossary.md) for pipeline fields, export contract, and action selection.
- **v2 `companion_workflows`** — optional root field on v2 pipeline documents (strict validate allowlist).

### Changed

- **pipeline-compose-export** and **pipeline-compose-context-merge** — Node 24 actions with bundled `index.ts` (replacing inline composite steps); included in `bundle:actions`.
- **Action READMEs** — per-action **Glossary** sections (self-contained; no monorepo visit required).
- **Meta-repo** — v2 `pipeline.yml` + `release.yml` orchestrated via `./packages/action-run`.
- **Action publish** — append-only `master` on action repos, immutable semver tags (no force push / no tag retag); publish commits record monorepo SHA.

### pipeline-compose-export

- Node 24 action using `@actions/artifact`; same artifact contract (`pipeline-compose-<stage_id>` / `outputs.json`).

### pipeline-compose-context-merge

- Node 24 action; merges stage outputs into a local context JSON file (unchanged behavior).

## [0.4.0] - 2026-06-14

### Added

- **Cross-Repo Orchestrator positioning** — README and docs emphasize multi-repo orchestration as the primary value proposition.
- **`pipeline-compose init`** — scan `.github/workflows/` for `workflow_dispatch` / `workflow_call` workflows, infer local `uses:` dependencies, write starter `.github/pipelines/pipeline.yml`.
- **`validate --mermaid`** — emit a Mermaid flowchart of stage topology and `needs:` edges.
- **`pipeline-compose-export`** — composite action to upload `pipeline-compose-<stage_id>` artifacts without manual `jq` wiring.
- **PR validation bot** — posts sticky PR comments with Mermaid topology and validate results when pipeline files change.

### pipeline-compose-export

- Composite action: `stage_id` + JSON `outputs` → artifact `pipeline-compose-<stage_id>` / `outputs.json`.

## [0.3.3] - 2026-06-14

### Added

- **`repo_tokens_json`** on run action — map `owner/repo` slugs to PATs for cross-repo `repo:` stages; fail-fast when a slug is missing.
- **Cross-repo 403 errors** — actionable messages referencing `repo_tokens_json` and target permissions.
- **Validate** — `stage.cross-repo-token` issue; CLI `--repo-tokens-file` for local strict checks.
- **Manual smoke** — `workflow_dispatch` workflow for cross-repo dispatch (`CROSS_REPO_SMOKE_TOKEN`).
- **Cross-repo stages** — optional `repo: owner/repo` on stages; run action dispatches with a scoped GitHub client.
- **Richer `when:`** — `contains()`, `&&`, and `||` on the run/eval path.
- **CLI** — `validate --json` and `sync --dry-run` preview output.
- **CI guard** — `check-workspace-versions.sh` ensures package.json versions match the latest release tag (sync still runs on tag push).
- **Tests** — GitHub API client mocks; sync/validate preview coverage; coverage thresholds raised to 65% (action/CLI entry shims excluded).
- **Docs** — cross-repo tutorial, `examples/cross-repo-dispatch/`, manga-cdc case study.

### Changed

- Workflow sync preview lists `create`, `update`, `up-to-date`, and `missing-source` actions without writing files.
- **act:full** — includes workflow-lint job.

### Fixed

- **Dependabot** — pin transitive `esbuild` to `>=0.28.1` via pnpm overrides (vite dev dependency).

### pipeline-compose-run

- **`repo_tokens_json`** input for cross-repo stage dispatch.

### pipeline-compose-compile

- No changes in this release.

### pipeline-compose-eval

- No changes in this release.

### pipeline-compose-context-merge

- No changes in this release.

## [0.3.2] - 2026-06-14

### Fixed

- **Run orchestrator** — skipped `when:` stages now skip transitive dependents; missing required context fails fast.
- **`waitForRun`** — better tag-dispatch matching; extracted `matchesDispatchedRun` with tests.
- **Expression eval** — supports `github.ref == '…'` on the run path.
- **Compile parity** — compile CLI and compile action accept v2 and `pipeline_dir` like run/validate.
- **action-eval** — JSON parse errors return clean action failures.

### Added

- **`companion_workflows`** on v1 pipelines for intentional non-stage workflows (e.g. native `release.yml`).
- **CI** — pipeline validate (strict) on meta + example; coverage baseline in unit tests.
- **Local act smoke** — `pnpm run act:full` runs full-smoke workflow (tests, validate, eval, compile parity, bundle).
- **Group path convention** — workflow basename may match stage `id`.
- **Version sync scope** — all workspace `package.json` files and action README `@v` usage blocks (not `examples/`).

### Fixed (release)

- **Version sync** — expands to all workspace packages and action README consumer refs; release/publish jobs checkout `master` after tag retag to avoid checkout race.

### Changed

- Job output collection prefers the last successful job in a stage run.
- Docs updated for groups, validate/sync, `pipeline_dir`, and run-path `when:` support.

## [0.3.1] - 2026-06-14

### Added

- **`pipeline-compose eval` CLI** — evaluate `when:` expressions locally (`--expression`, `--context`, `--github`).
- **Examples** — copy-paste templates for all four actions under `examples/`.
- **Publish from master** — `publish-actions` workflow `use_master` input for doc-only republishes without retagging.
- **Tests** — validator coverage; orchestrator artifact fallback and failure paths.

### Changed

- CI lints workflow YAML in `examples/`.
- Dependency updates (vitest, `@actions/core`, transitive tooling); Dependabot for npm and GitHub Actions.
- Action READMEs and discoverability metadata.

### pipeline-compose-run

- Examples, compare table, and tutorial links.

### pipeline-compose-compile

- Compile-check example and compare table.

### pipeline-compose-eval

- Conditional gate example; `help-circle` Marketplace icon.

### pipeline-compose-context-merge

- Manual context example and compare table.

## [0.3.0] - 2026-06-14

### Changed

- **Monorepo refactor** — pnpm workspace with shared `@aeswibon/pipeline-compose-core` and packages for CLI and all four actions (`packages/core`, `packages/cli`, `packages/action-*`).
- Single development surface: edit core once, test with `pnpm test`, bundle with `pnpm run bundle:actions`, publish with `pnpm run publish:actions`.
- Removed legacy root `src/`, `bin/`, and `schema/`; schema now lives at `packages/core/schema/`.
- CI compile parity uses `./packages/action-compile` (built in CI, not committed).
- Replaced sibling-repo scaffold scripts with `scripts/publish-action-packages.sh`.
- Tag releases publish all four action repos in CI (`publish-actions` stage; requires `ACTION_PUBLISH_TOKEN` secret).

### Developer notes

See [docs/development.md](docs/development.md) and [docs/action-repos.md](docs/action-repos.md).

### pipeline-compose-run

- Rebuilt bundle from monorepo `@aeswibon/pipeline-compose-core` v0.3.0.

### pipeline-compose-compile

- Rebuilt bundle from monorepo core v0.3.0.

### pipeline-compose-eval

- Rebuilt bundle from monorepo core v0.3.0.

### pipeline-compose-context-merge

- Republished composite action from monorepo package.

## [0.2.0] - 2026-06-14

### Changed

- **Actions split into dedicated repositories** (Marketplace-ready, root `action.yml` each):
  - [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) — `aeswibon/pipeline-compose-run@v0.1.0`
  - [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) — `aeswibon/pipeline-compose-compile@v0.1.0`
  - [pipeline-compose-eval](https://github.com/aeswibon/pipeline-compose-eval) — `aeswibon/pipeline-compose-eval@v0.1.0`
  - [pipeline-compose-context-merge](https://github.com/aeswibon/pipeline-compose-context-merge) — `aeswibon/pipeline-compose-context-merge@v0.1.0`
- This repo is now **CLI, schema, docs, and release workflows** only (embedded actions removed).
- Tag releases use [`.github/workflows/release.yml`](.github/workflows/release.yml) with native reusable workflows (`ci` → `version-sync` → `release-publish`).
- Required `CHANGELOG.md` section enforced before every tag release.

### Migration

```yaml
# before
uses: aeswibon/pipeline-compose/run@v0.1.0

# after
uses: aeswibon/pipeline-compose-run@v0.1.0
```

See [docs/action-repos.md](docs/action-repos.md).

## [0.1.0] - 2026-06-14

First release of **pipeline-compose** — define the order your GitHub Actions workflows run with one pipeline YAML file and one action step. No compile step and no generated workflow to commit.

### Added

- **`run` action** (`aeswibon/pipeline-compose/run@v0.1.0`) — primary runtime orchestrator
  - Reads pipeline YAML (schema v1) and topologically sorts stages by `needs`
  - Dispatches each stage via `workflow_dispatch`, waits for completion, chains the next stage
  - Passes prior stage outputs into later inputs via `${{ context.<stage-id>.<output> }}`
  - Conditional stages with `when:` (supported expression subset)
  - `results_json` output: JSON array of `{ stageId, runId, outputs }` per completed stage
- **`compile` action** — optional static workflow codegen for teams that prefer a committed runner workflow
- **CLI** — `pipeline-compose compile` and `pipeline-compose eval` for local validation and codegen
- **Pipeline schema v1** — `name`, `version`, `stages[]` with `id`, `workflow`, `needs`, `inputs`, `outputs`, `when`
- **Artifact-based output collection** — stages export `pipeline-compose-<stage-id>/outputs.json` because GitHub's API does not return job outputs for `workflow_dispatch` runs
- **Documentation** — consumer-focused [README](README.md), [docs/examples.md](docs/examples.md), [docs/development.md](docs/development.md)
- **Template** — [templates/pipeline-run.yml](templates/pipeline-run.yml) entry workflow for tag/release pipelines

### Usage

```yaml
permissions:
  contents: write
  actions: write

jobs:
  run-pipeline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: aeswibon/pipeline-compose/run@v0.1.0
        with:
          pipeline_file: .github/pipelines/pipeline.yml
          github_token: ${{ github.token }}
```

### Stage contract

Each stage workflow must:

1. Include a `workflow_dispatch` trigger (with inputs referenced by the pipeline)
2. Upload an artifact named `pipeline-compose-<stage-id>` containing `outputs.json` for any output keys listed in the pipeline file

See [docs/examples.md](docs/examples.md) for full stage examples and troubleshooting.

### Permissions

The token passed to `github_token` requires **`actions: write`** to dispatch workflows in the same repository. Release pipelines often also need **`contents: write`**.

### Limitations (v0.1.0)

- Same-repository stages only
- Each stage runs as a separate workflow dispatch (not inlined jobs)
- Cross-stage data requires artifact export (see above)
- `when` expressions support a subset of GitHub expression syntax

### Planned

- Cross-repo stage dispatch
- Richer expression support
- Reusable stage catalog patterns

[0.2.0]: https://github.com/aeswibon/pipeline-compose/releases/tag/v0.2.0
[0.1.0]: https://github.com/aeswibon/pipeline-compose/releases/tag/v0.1.0
