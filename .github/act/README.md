# Local GitHub Actions (act)

Run workflows locally with [nektos/act](https://github.com/nektos/act).

## Prerequisites

- Docker (OrbStack, Colima, or Docker Desktop) running
- `act` installed
- `pnpm install && pnpm run bundle` before compile workflows (local actions need bundled JS)

## Docker socket (macOS)

`.actrc` sets `--bind` so act sees local action files. Set your Docker socket explicitly:

```bash
export ACT_DOCKER_SOCKET="${HOME}/.orbstack/run/docker.sock"
# or Colima:
# export ACT_DOCKER_SOCKET="${HOME}/.colima/default/docker.sock"
```

## Commands

```bash
pnpm run act:ci       # CI test job only (fast)
pnpm run act:compile  # workflow_dispatch compile-example job
```

Or directly:

```bash
ACT=true act push -W .github/workflows/ci.yml -j test \
  --container-daemon-socket "unix://${ACT_DOCKER_SOCKET}"
```

```bash
pnpm run bundle
ACT=true act workflow_dispatch \
  -W .github/workflows/compile-example.yml \
  -e .github/act/workflow-dispatch-compile.json \
  -j compile \
  --container-daemon-socket "unix://${ACT_DOCKER_SOCKET}"
```

## Fixture

| File | Purpose |
|------|---------|
| `.github/act/workflow-dispatch-compile.json` | Inputs for `compile-example.yml` |

Expected: `examples/act-output.generated.yml` is written with `workflow_call` and stage jobs.

## Notes

- `ACT=true` is set by `scripts/act-test.sh` for workflows that skip push-only steps in the future.
- Local actions under `compile/` require `pnpm run bundle` first (`compile/dist/index.js`).
