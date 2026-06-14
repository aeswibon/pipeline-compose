# Local GitHub Actions (act)

Run workflows locally with [nektos/act](https://github.com/nektos/act).

**act never runs production workflows.** Local smoke tests live under `.github/act/workflows/` and are only invoked via `scripts/act-test.sh`. Production CI in `.github/workflows/ci.yml` runs on GitHub.

## Prerequisites

- Docker (OrbStack, Colima, or Docker Desktop) running
- `act` installed

## Docker socket (macOS)

`.actrc` sets `--bind` so act sees local action files. Set your Docker socket explicitly:

```bash
export ACT_DOCKER_SOCKET="${HOME}/.orbstack/run/docker.sock"
# or Colima:
# export ACT_DOCKER_SOCKET="${HOME}/.colima/default/docker.sock"
```

## Commands

| Command | What it runs |
|---------|----------------|
| `pnpm run act:full` | Full smoke — tests, coverage, validate, eval, compile parity, bundle all Node actions |
| `pnpm run act:ci` | Quick — unit tests + build |
| `pnpm run act:compile` | CLI compile against `pipeline.yml` |

```bash
pnpm run act:full
```

## Act-only workflows

| Workflow | Purpose |
|----------|---------|
| `.github/act/workflows/full-smoke.yml` | Full local CI parity (default for `act:full`) |
| `.github/act/workflows/test-smoke.yml` | Unit tests + build |
| `.github/act/workflows/compile-smoke.yml` | CLI compile against pipeline.yml |

These use `workflow_dispatch` only — they do not run on push/PR to GitHub.

`full-smoke.yml` runs jobs **sequentially** (each job `needs` the previous one). GitHub CI runs validate, compile parity, and bundles in parallel; act chains them so multiple containers do not run `pnpm run build` against the same bind-mounted workspace at once (which can hang on macOS).

## What act covers vs GitHub CI

| Check | act (`act:full`) | GitHub CI |
|-------|------------------|-----------|
| Unit tests + coverage | yes | yes |
| Pipeline validate (strict) | yes | yes |
| CLI eval | yes | no |
| Compile CLI ↔ action parity | yes | yes |
| Bundle run / compile / eval actions | yes | yes (in workflow-lint job) |
| actionlint + yamllint | no | yes |
| Live `pipeline-compose-run` dispatch | no | yes on tag push via `release.yml` + `./packages/action-run` |

The run orchestrator is covered by unit tests (`packages/action-run/src/orchestrator.test.ts`). Dispatching stage workflows still requires GitHub.

## Fixture

| File | Purpose |
|------|---------|
| `.github/act/workflow-dispatch-compile.json` | Inputs for compile smoke |

## Guardrails

| Layer | What it does |
|-------|----------------|
| **Separate workflow files** | act targets `.github/act/workflows/*`, not `.github/workflows/ci.yml` |
| **Local compile action** | `./packages/action-compile` is used for parity — published actions live in separate repos |
