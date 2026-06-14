#!/usr/bin/env bash
# Fail unless CHANGELOG.md contains a non-empty ## [X.Y.Z] section.
set -euo pipefail

usage() {
  echo "Usage: $0 X.Y.Z" >&2
  exit 1
}

[[ $# -ge 1 ]] || usage

VERSION="$1"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid semver: $VERSION" >&2
  exit 1
fi

read_changelog() {
  local tag_ref="v${VERSION}"
  if git rev-parse "$tag_ref^{commit}" >/dev/null 2>&1 \
    && git cat-file -e "${tag_ref}:CHANGELOG.md" 2>/dev/null; then
    git show "${tag_ref}:CHANGELOG.md"
    return
  fi

  if [[ -f CHANGELOG.md ]]; then
    cat CHANGELOG.md
    return
  fi

  return 1
}

extract_section() {
  awk -v ver="$VERSION" '
    BEGIN { found=0; lines=0 }
    /^## \[/ {
      if (found) exit
      if ($0 ~ "\\[" ver "\\]") { found=1; next }
    }
    found && /^## \[/ { exit }
    found {
      if ($0 ~ /[^[:space:]]/) lines++
      print
    }
    END { exit(found && lines > 0 ? 0 : 1) }
  '
}

if ! changelog="$(read_changelog)"; then
  echo "CHANGELOG.md is missing. Add a ## [${VERSION}] section before tagging v${VERSION}." >&2
  exit 1
fi

if ! section="$(printf '%s\n' "$changelog" | extract_section)"; then
  echo "CHANGELOG.md has no release notes for ${VERSION}." >&2
  echo "Add a non-empty section:" >&2
  echo "" >&2
  echo "## [${VERSION}] - YYYY-MM-DD" >&2
  echo "" >&2
  echo "### Added" >&2
  echo "- ..." >&2
  exit 1
fi

echo "Found CHANGELOG section for ${VERSION} ($(printf '%s\n' "$section" | wc -l | tr -d ' ') lines)"
