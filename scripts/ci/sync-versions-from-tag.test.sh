#!/usr/bin/env bash
# Smoke test for sync-versions-from-tag.sh (temp git repo; no push).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SYNC="${ROOT}/scripts/ci/sync-versions-from-tag.sh"
# shellcheck source=version-sync-manifest.sh
source "${ROOT}/scripts/ci/version-sync-manifest.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

copy_fixture() {
  for file in "${VERSION_PACKAGE_JSONS[@]}"; do
    mkdir -p "$TMP/$(dirname "$file")"
    echo '{"name":"fixture","version": "0.3.1"}' > "$TMP/$file"
  done

  for file in "${VERSION_ACTION_READMES[@]}"; do
    mkdir -p "$TMP/$(dirname "$file")"
    case "$file" in
      *action-run*)
        cat > "$TMP/$file" <<'EOF'
- uses: aeswibon/pipeline-compose-run@v0.3.1
- uses: aeswibon/pipeline-compose-run@v0.3.0
EOF
        ;;
      *action-compile*)
        echo '- uses: aeswibon/pipeline-compose-compile@v0.3.1' > "$TMP/$file"
        ;;
      *action-eval*)
        echo '- uses: aeswibon/pipeline-compose-eval@v0.3.1' > "$TMP/$file"
        ;;
      *action-context-merge*)
        echo '- uses: aeswibon/pipeline-compose-context-merge@v0.3.1' > "$TMP/$file"
        ;;
    esac
  done
}

assert_version() {
  local file="$1"
  local expected="$2"
  if ! grep -Fq "\"version\": \"${expected}\"" "$file"; then
    echo "Expected $file to contain version $expected" >&2
    cat "$file" >&2
    exit 1
  fi
}

copy_fixture
cd "$TMP"
git init -q
git add -A
git commit -q -m "fixture"

"$SYNC" 0.3.2

for file in "${VERSION_PACKAGE_JSONS[@]}"; do
  assert_version "$file" 0.3.2
done

grep -Fq 'aeswibon/pipeline-compose-run@v0.3.2' packages/action-run/README.md
grep -Fq 'aeswibon/pipeline-compose-run@v0.3.0' packages/action-run/README.md
grep -Fq 'aeswibon/pipeline-compose-compile@v0.3.2' packages/action-compile/README.md

"$SYNC" 0.3.2
if ! git diff --quiet; then
  echo "Second sync should be idempotent" >&2
  git diff >&2
  exit 1
fi

echo "sync-versions-from-tag.test.sh: ok"
