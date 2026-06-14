#!/usr/bin/env bash
# Build GitHub release notes for a semver tag.
# Requires a matching section in CHANGELOG.md, then appends GitHub-generated commit notes.
set -euo pipefail

usage() {
  echo "Usage: $0 X.Y.Z [output.md]" >&2
  exit 1
}

[[ $# -ge 1 ]] || usage

VERSION="$1"
OUT="${2:-release-notes.md}"
TAG="v${VERSION}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid semver: $VERSION" >&2
  exit 1
fi

bash "${ROOT}/scripts/ci/require-changelog-section.sh" "$VERSION"

changelog_section() {
  awk -v ver="$VERSION" '
    BEGIN { found=0 }
    /^## \[/ {
      if (found) exit
      if ($0 ~ "\\[" ver "\\]") { found=1; next }
    }
    found && /^## \[/ { exit }
    found { print }
  ' CHANGELOG.md
}

generated_notes() {
  gh api "repos/${REPO}/releases/generate-notes" \
    -f "tag_name=${TAG}" \
    --jq '.body' 2>/dev/null || true
}

main_section="$(changelog_section | sed '/./,$!d')"
auto_section="$(generated_notes)"

{
  printf '%s\n' "$main_section"

  if [[ -n "$auto_section" ]]; then
    printf '\n---\n\n'
    printf '%s\n' "$auto_section"
  fi
} > "$OUT"

echo "Wrote release notes to $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
