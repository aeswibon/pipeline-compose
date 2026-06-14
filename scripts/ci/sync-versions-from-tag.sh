#!/usr/bin/env bash
# Align repo version files with a release tag (vX.Y.Z -> X.Y.Z).
set -euo pipefail

usage() {
  echo "Usage: $0 [X.Y.Z]" >&2
  echo "  Reads version from GITHUB_REF=refs/tags/vX.Y.Z when no argument is given." >&2
  exit 1
}

resolve_version() {
  if [[ -n "${1:-}" ]]; then
    echo "$1"
    return
  fi

  local ref="${GITHUB_REF:-}"
  if [[ "$ref" =~ ^refs/tags/v(.+)$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi

  usage
}

VERSION="$(resolve_version "${1:-}")"
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid semver: $VERSION" >&2
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "Syncing version files to $VERSION"

perl -i -pe 's/"version": "[^"]+"/"version": "'"$VERSION"'"/' package.json

if git diff --quiet -- package.json; then
  echo "Version files already at $VERSION"
else
  echo "Updated version files:"
  git diff --stat -- package.json
fi
