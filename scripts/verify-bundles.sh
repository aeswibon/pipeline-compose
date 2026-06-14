#!/usr/bin/env bash
# Preflight for act compile smoke — bundled actions must exist locally.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

missing=0
for path in compile/dist/index.js eval/dist/index.js; do
  if [[ ! -f "$path" ]]; then
    echo "Missing $path" >&2
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo "Run 'pnpm run build' to bundle actions before act compile smoke." >&2
  exit 1
fi

echo "Bundled actions OK (compile/dist, eval/dist)."
