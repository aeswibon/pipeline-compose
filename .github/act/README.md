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

```bash
pnpm run act:ci       # test smoke — pnpm test only
pnpm run act:compile  # compile smoke — CLI only
```

## Act-only workflows

| Workflow | Purpose |
|----------|---------|
| `.github/act/workflows/test-smoke.yml` | Unit tests via pnpm |
| `.github/act/workflows/compile-smoke.yml` | CLI compile against pipeline.yml |

These use `workflow_dispatch` only — they do not run on push/PR to GitHub.

## Fixture

| File | Purpose |
|------|---------|
| `.github/act/workflow-dispatch-compile.json` | Inputs for compile smoke |

Expected: compile smoke writes `/tmp/act-compile-out.yml` with `compile-check` and stage jobs.

## Guardrails

| Layer | What it does |
|-------|----------------|
| **Separate workflow files** | act targets `.github/act/workflows/*`, not `.github/workflows/ci.yml` |
| **No bundled actions in this repo** | Actions live in separate repositories — see `docs/action-repos.md` |
