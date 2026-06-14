#!/usr/bin/env bash
# Smoke test for check-workspace-versions.sh (temp git repo with tag).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECK="${ROOT}/scripts/ci/check-workspace-versions.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/scripts/ci"
cp "${ROOT}/scripts/ci/version-sync-manifest.sh" "$TMP/scripts/ci/"
cp "$CHECK" "$TMP/scripts/ci/check-workspace-versions.sh"
chmod +x "$TMP/scripts/ci/check-workspace-versions.sh"

for file in package.json packages/core/package.json packages/cli/package.json \
  packages/action-run/package.json packages/action-compile/package.json \
  packages/action-eval/package.json packages/action-context-merge/package.json; do
  mkdir -p "$TMP/$(dirname "$file")"
  echo '{"name":"fixture","version": "9.9.9"}' > "$TMP/$file"
done

cd "$TMP"
git init -q
git config user.email "test@example.com"
git config user.name "Test"
git add -A
git commit -q -m "fixture"
git tag -a v9.9.9 -m "Release v9.9.9"

bash scripts/ci/check-workspace-versions.sh

echo "check-workspace-versions.test.sh: ok"
