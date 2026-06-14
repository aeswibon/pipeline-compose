#!/usr/bin/env bash
# Build GitHub release notes for an action repo from the monorepo CHANGELOG.
#
# Usage: render-action-release-notes.sh X.Y.Z pipeline-compose-run [output.md]
#
# Reads CHANGELOG.md from the monorepo root. Uses a ### pipeline-compose-run
# subsection under ## [X.Y.Z] when present; otherwise uses the full version section.
# Appends a link to the matching meta-repo release when available.
set -euo pipefail

usage() {
  echo "Usage: $0 X.Y.Z ACTION_REPO [output.md]" >&2
  echo "Example: $0 0.3.0 pipeline-compose-run release-notes.md" >&2
  exit 1
}

[[ $# -ge 2 ]] || usage

VERSION="$1"
ACTION_REPO="$2"
OUT="${3:-release-notes.md}"
TAG="v${VERSION}"
META_REPO="${META_REPO:-aeswibon/pipeline-compose}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid semver: $VERSION" >&2
  exit 1
fi

cd "$ROOT"
bash "${ROOT}/scripts/ci/require-changelog-section.sh" "$VERSION"

read_changelog() {
  local tag_ref="v${VERSION}"
  if git rev-parse "$tag_ref^{commit}" >/dev/null 2>&1 \
    && git cat-file -e "${tag_ref}:CHANGELOG.md" 2>/dev/null; then
    git show "${tag_ref}:CHANGELOG.md"
    return
  fi
  cat CHANGELOG.md
}

version_section() {
  awk -v ver="$VERSION" '
    BEGIN { found=0 }
    /^## \[/ {
      if (found) exit
      if ($0 ~ "\\[" ver "\\]") { found=1; next }
    }
    found && /^## \[/ { exit }
    found { print }
  '
}

action_section() {
  awk -v action="$ACTION_REPO" '
    BEGIN { found=0; lines=0 }
    /^### / {
      if (found) exit
      if ($0 ~ "^### " action "([[:space:]]|$)") { found=1; next }
    }
    found && /^### / { exit }
    found {
      if ($0 ~ /[^[:space:]]/) lines++
      print
    }
    END { exit(found && lines > 0 ? 0 : 1) }
  '
}

main_section="$(read_changelog | version_section | sed '/./,$!d')"
if action_body="$(printf '%s\n' "$main_section" | action_section | sed '/./,$!d')"; then
  notes_body="$action_body"
else
  notes_body="$main_section"
fi

{
  printf '%s\n' "$notes_body"
  printf '\n---\n\n'
  printf 'Published from [%s](https://github.com/%s) monorepo tag [`%s`](https://github.com/%s/releases/tag/%s).\n' \
    "$META_REPO" "$META_REPO" "$TAG" "$META_REPO" "$TAG"
} > "$OUT"

echo "Wrote action release notes for ${ACTION_REPO}@${TAG} to ${OUT} ($(wc -c < "$OUT" | tr -d ' ') bytes)"
