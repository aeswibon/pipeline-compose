#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v act >/dev/null 2>&1; then
  echo "act is not installed. See https://github.com/nektos/act" >&2
  exit 1
fi

if [[ -z "${ACT_DOCKER_SOCKET:-}" ]]; then
  for candidate in \
    "${HOME}/.orbstack/run/docker.sock" \
    "${HOME}/.colima/default/docker.sock" \
    "/var/run/docker.sock"; do
    if [[ -S "$candidate" ]]; then
      export ACT_DOCKER_SOCKET="$candidate"
      break
    fi
  done
fi

SOCKET_ARGS=()
if [[ -n "${ACT_DOCKER_SOCKET:-}" ]]; then
  SOCKET_ARGS=(--container-daemon-socket "unix://${ACT_DOCKER_SOCKET}")
fi

ARCH_ARGS=()
if [[ "$(uname -m)" == "arm64" ]]; then
  ARCH_ARGS=(--container-architecture linux/amd64)
fi

TARGET="${1:-ci}"

case "$TARGET" in
  ci)
    ACT=true act push \
      -W .github/workflows/ci.yml \
      -j test \
      "${ARCH_ARGS[@]}" \
      "${SOCKET_ARGS[@]}"
    ;;
  compile)
    ACT=true act workflow_dispatch \
      -W .github/workflows/compile-example.yml \
      -e .github/act/workflow-dispatch-compile.json \
      -j compile \
      "${ARCH_ARGS[@]}" \
      "${SOCKET_ARGS[@]}"
    ;;
  *)
    echo "Usage: $0 [ci|compile]" >&2
    exit 1
    ;;
esac
