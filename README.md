# pipeline-compose

**Cross-repo orchestration for GitHub Actions** — one pipeline YAML, ordered stages, optional dispatch to other repositories.

Native `needs:` stops at repo boundaries. **pipeline-compose-run** dispatches each stage workflow, waits for completion, merges stage outputs into context, and surfaces one pipeline result. No generated workflow to commit unless you choose [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile).

**Stable release:** **v1.6.0** — GitHub App cross-repo auth, stage catalog, plus v1.4 smart rerun, sub-pipelines, and typed context.

## Actions

| Action | Repository | Role |
|--------|------------|------|
| **Run** | [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) | Orchestrate stages (start here) |
| **Export** | [pipeline-compose-export](https://github.com/aeswibon/pipeline-compose-export) | Publish `outputs.json` artifact per stage |
| Compile | [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) | Generate a committed workflow from pipeline YAML |
| Eval | [pipeline-compose-eval](https://github.com/aeswibon/pipeline-compose-eval) | Evaluate `when:` expressions |
| Context merge | [pipeline-compose-context-merge](https://github.com/aeswibon/pipeline-compose-context-merge) | Manual context JSON without run |

Each action README includes a self-contained glossary.

## Quick start

**1. Pipeline file** (`.github/pipelines/pipeline.yml`, schema v2):

```yaml
version: 2
companion_workflows:
  - .github/workflows/release.yml
pipelines:
  release:
    stages:
      - id: ci
        workflow: .github/workflows/ci.yml
      - id: deploy
        workflow: .github/workflows/deploy.yml
        needs: [ci]
```

**2. Entry workflow** (e.g. tag push):

```yaml
- uses: aeswibon/pipeline-compose-run@v1.6.0
  with:
    pipeline_file: .github/pipelines/pipeline.yml
```

**3. Stage with downstream outputs** — add [pipeline-compose-export](https://github.com/aeswibon/pipeline-compose-export) as the last step in that stage’s workflow.

Copy-paste examples: [examples/](examples/) · Tutorial: [docs/tutorials/tag-release-pipeline.md](docs/tutorials/tag-release-pipeline.md)

## CLI (monorepo / local)

```bash
pnpm run init          # scan workflows → starter pipeline.yml (v2)
pnpm run validate .github/pipelines/pipeline.yml --repo-root . --workflows --strict --mermaid
pnpm run compile .github/pipelines/pipeline.yml -o .github/workflows/pipeline-generated.yml
```

See [docs/development.md](docs/development.md) for the full command list and release process.

## Documentation

| Topic | Location |
|-------|----------|
| Run + export setup | [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) |
| Examples (copy `.github/`) | [examples/](examples/) |
| Tag release walkthrough | [docs/tutorials/tag-release-pipeline.md](docs/tutorials/tag-release-pipeline.md) |
| Cross-repo `repo:` stages | [docs/tutorials/cross-repo-pipeline.md](docs/tutorials/cross-repo-pipeline.md) |
| Mermaid topology + PR bot | [docs/mermaid-demo.md](docs/mermaid-demo.md) |
| Monorepo development | [docs/development.md](docs/development.md) |
| Glossary | [docs/glossary.md](docs/glossary.md) |
| **1.0 GA / breaking changes** | [docs/migration/v1.0.md](docs/migration/v1.0.md) |
| Upgrading from 0.5 | [docs/migration/v0.5.md](docs/migration/v0.5.md) |
| Pipeline schema (v2) | [packages/core/schema/pipeline-v2.schema.json](packages/core/schema/pipeline-v2.schema.json) |
| Publishing action repos | [docs/action-repos.md](docs/action-repos.md) |

## Local CI with act

```bash
pnpm run act:full    # tests, validate, compile parity, bundles
pnpm run act:ci      # unit tests + build
```

Requires [Docker](https://docs.docker.com/get-docker/) and [act](https://github.com/nektos/act). See [.github/act/README.md](.github/act/README.md).

## License

[MIT](LICENSE)
