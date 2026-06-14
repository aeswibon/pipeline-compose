# Local GitHub Actions (act)

Run workflows locally with [nektos/act](https://github.com/nektos/act).

**act never runs production workflows.** Local smoke tests live under `.github/act/workflows/` and are only invoked via `scripts/act-test.sh`. Production CI in `.github/workflows/ci.yml` is unchanged and always runs the full pipeline on GitHub.

## Prerequisites

- Docker (OrbStack, Colima, or Docker Desktop) running
- `act` installed
- For compile smoke: `pnpm run build` once (uses committed `compile/dist` bundles)

## Docker socket (macOS)

`.actrc` sets `--bind` so act sees local action files. Set your Docker socket explicitly:

```bash
export ACT_DOCKER_SOCKET="${HOME}/.orbstack/run/docker.sock"
# or Colima:
# export ACT_DOCKER_SOCKET="${HOME}/.colima/default/docker.sock"
```

## Commands

```bash
pnpm run act:ci       # test smoke — pnpm test only (no ncc bundle)
pnpm run act:compile  # compile smoke — uses pre-built compile/dist
```

Before compile smoke:

```bash
pnpm run build
bash scripts/verify-bundles.sh   # optional; act-test.sh runs this automatically
```

## Act-only workflows

| Workflow | Purpose |
|----------|---------|
| `.github/act/workflows/test-smoke.yml` | Unit tests via pnpm |
| `.github/act/workflows/compile-smoke.yml` | Compile action against pipeline.yml |

These use `workflow_dispatch` only — they do not run on push/PR to GitHub.

## Fixture

| File | Purpose |
|------|---------|
| `.github/act/workflow-dispatch-compile.json` | Inputs for compile smoke |

Expected: compile smoke writes `/tmp/act-compile-out.yml` with `workflow_call` and stage jobs.

## Guardrails

| Layer | What it does |
|-------|----------------|
| **Separate workflow files** | act targets `.github/act/workflows/*`, not `.github/workflows/ci.yml` |
| **`verify-bundles.sh`** | Fails fast if `compile/dist` or `eval/dist` are missing |
| **No `ACT` env in production CI** | GitHub CI always bundles; act workflows never bundle |
