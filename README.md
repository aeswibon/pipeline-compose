# pipeline-compose

**The Cross-Repo Orchestrator for GitHub Actions.**

Define **in what order** workflows run across one repository or many — one pipeline YAML file, one orchestrator step. No generated workflow to commit, no brittle `repository_dispatch` chains, no polling scripts to stitch PR checks together.

Native Actions `needs:` stops at repo boundaries. **pipeline-compose** keeps going: dispatch stages in other repositories, wait for completion, merge outputs into context, and surface a single pipeline result.

This repository is the **development monorepo** (core library, CLI, docs, release automation). Each GitHub Action is published from its own repository:

| Action | Repository |
|--------|------------|
| **Run** (start here) | [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) |
| **Export** (stage outputs) | [pipeline-compose-export](https://github.com/aeswibon/pipeline-compose-export) |
| Compile (optional) | [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) |
| Eval | [pipeline-compose-eval](https://github.com/aeswibon/pipeline-compose-eval) |
| Context merge | [pipeline-compose-context-merge](https://github.com/aeswibon/pipeline-compose-context-merge) |

**Usage, inputs, and examples** live in those action repositories (same pattern as [actions/checkout](https://github.com/actions/checkout)).

## Quick start

```bash
# Generate a starter pipeline from existing workflows
pnpm dlx pipeline-compose init

# Validate topology and visualize the DAG
pnpm run validate .github/pipelines/pipeline.yml --workflows --strict --mermaid
```

## CLI (local)

```bash
pnpm run init
pnpm run validate .github/pipelines/pipeline.yml --workflows --strict --mermaid
pnpm run compile .github/pipelines/pipeline.yml -o .github/workflows/pipeline-generated.yml
pnpm run eval -- --expression "startsWith(github.ref, 'refs/tags/v')" --github '{"ref":"refs/tags/v1.0.0"}'
pnpm run sync:workflows .github/pipelines/pipeline.yml --check
```

Pipelines support **cross-repo `repo:` stages**, **groups**, **v2 multi-pipeline** files, and **multi-file** directories merged by pipeline-level `needs`. See [docs/tutorials/cross-repo-pipeline.md](docs/tutorials/cross-repo-pipeline.md) and [docs/development.md](docs/development.md).

## Local testing with act

Run the full smoke suite locally (tests, validate, eval, compile parity, action bundles):

```bash
pnpm run act:full    # all jobs — mirrors most of CI
pnpm run act:ci      # quick: unit tests + build
pnpm run act:compile # compile CLI only
```

Requires [Docker](https://docs.docker.com/get-docker/) and [act](https://github.com/nektos/act). See [.github/act/README.md](.github/act/README.md).

## Documentation

| Topic | Location |
|-------|----------|
| Run action usage | [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) |
| Stage output export | [pipeline-compose-export](https://github.com/aeswibon/pipeline-compose-export) |
| Copy-paste examples (all actions) | [examples/](examples/) |
| Tag release tutorial (Dev.to / blog) | [docs/tutorials/tag-release-pipeline.md](docs/tutorials/tag-release-pipeline.md) |
| Cross-repo dispatch tutorial | [docs/tutorials/cross-repo-pipeline.md](docs/tutorials/cross-repo-pipeline.md) |
| Extended examples | [docs/examples.md](docs/examples.md) |
| Monorepo development | [docs/development.md](docs/development.md) |
| Publishing actions | [docs/action-repos.md](docs/action-repos.md) |
| v0.4 activation design | [docs/specs/2026-06-14-v040-activation-design.md](docs/specs/2026-06-14-v040-activation-design.md) |
| Pipeline schema (v1) | [packages/core/schema/pipeline-v1.schema.json](packages/core/schema/pipeline-v1.schema.json) |
| Pipeline schema (v2, multi-pipeline) | [packages/core/schema/pipeline-v2.schema.json](packages/core/schema/pipeline-v2.schema.json) |

## License

[MIT](LICENSE)
