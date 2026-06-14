# pipeline-compose

Define **in what order** your GitHub Actions workflows run — one pipeline YAML file, one orchestrator step. No generated workflow to commit.

This repository is the **development monorepo** (core library, CLI, docs, release automation). Each GitHub Action is published from its own repository:

| Action | Repository |
|--------|------------|
| **Run** (start here) | [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) |
| Compile (optional) | [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) |
| Eval | [pipeline-compose-eval](https://github.com/aeswibon/pipeline-compose-eval) |
| Context merge | [pipeline-compose-context-merge](https://github.com/aeswibon/pipeline-compose-context-merge) |

**Usage, inputs, and examples** live in those action repositories (same pattern as [actions/checkout](https://github.com/actions/checkout)).

## Documentation

| Topic | Location |
|-------|----------|
| Run action usage | [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) |
| Copy-paste examples (all actions) | [examples/](examples/) |
| Extended examples | [docs/examples.md](docs/examples.md) |
| Monorepo development | [docs/development.md](docs/development.md) |
| Publishing actions | [docs/action-repos.md](docs/action-repos.md) |
| Pipeline schema | [packages/core/schema/pipeline-v1.schema.json](packages/core/schema/pipeline-v1.schema.json) |

## License

[MIT](LICENSE)
