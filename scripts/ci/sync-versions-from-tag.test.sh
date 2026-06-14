#!/usr/bin/env bash
# Smoke test for sync-versions-from-tag.sh (isolated temp dir; no git).
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
  if ! grep -Fq "\"version\": \"${expected}\"" "$TMP/$file"; then
    echo "Expected $file to contain version $expected" >&2
    cat "$TMP/$file" >&2
    exit 1
  fi
}

snapshot_tree() {
  find "$TMP" -type f -print0 | sort -z | xargs -0 shasum -a 256
}

copy_fixture

before="$(snapshot_tree)"
SYNC_ROOT="$TMP" "$SYNC" 0.3.2
after_first="$(snapshot_tree)"

for file in "${VERSION_PACKAGE_JSONS[@]}"; do
  assert_version "$file" 0.3.2
done

grep -Fq 'aeswibon/pipeline-compose-run@v0.3.2' "$TMP/packages/action-run/README.md"
grep -Fq 'aeswibon/pipeline-compose-compile@v0.3.2' "$TMP/packages/action-compile/README.md"

SYNC_ROOT="$TMP" "$SYNC" 0.3.2
after_second="$(snapshot_tree)"

if [[ "$after_first" != "$after_second" ]]; then
  echo "Second sync should be idempotent" >&2
  diff <(echo "$after_first") <(echo "$after_second") >&2 || true
  exit 1
fi

if [[ "$before" == "$after_first" ]]; then
  echo "First sync should change fixture files" >&2
  exit 1
fi

echo "sync-versions-from-tag.test.sh: ok"
