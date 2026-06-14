#!/usr/bin/env bash
# Build GitHub release notes for a semver tag.
# Prefers the matching section in CHANGELOG.md, then appends GitHub-generated commit notes.
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

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid semver: $VERSION" >&2
  exit 1
fi

changelog_section() {
  [[ -f CHANGELOG.md ]] || return 0
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
  if [[ -n "$main_section" ]]; then
    printf '%s\n' "$main_section"
  fi

  if [[ -n "$auto_section" ]]; then
    if [[ -n "$main_section" ]]; then
      printf '\n---\n\n'
    fi
    printf '%s\n' "$auto_section"
  fi

  if [[ -z "$main_section" && -z "$auto_section" ]]; then
    printf 'Release %s\n\n**Full Changelog**: https://github.com/%s/commits/%s\n' \
      "$TAG" "$REPO" "$TAG"
  fi
} > "$OUT"

echo "Wrote release notes to $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
