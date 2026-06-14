#!/usr/bin/env bash
# Align repo version files with a release tag (vX.Y.Z -> X.Y.Z).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=version-sync-manifest.sh
source "${SCRIPT_DIR}/version-sync-manifest.sh"

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

sync_package_json() {
  local file="$1"
  local version="$2"
  perl -i -pe 's/"version"\s*:\s*"[^"]+"/"version": "'"$version"'"/' "$file"
}

sync_action_readme_refs() {
  local file="$1"
  local version="$2"
  perl -i -pe '
    s/(aeswibon\/pipeline-compose-[A-Za-z0-9-]+@)v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?/${1}v'"$version"'/g
  ' "$file"
}

VERSION="$(resolve_version "${1:-}")"
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid semver: $VERSION" >&2
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "Syncing version files to $VERSION"

for file in "${VERSION_PACKAGE_JSONS[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing package.json: $file" >&2
    exit 1
  fi
  sync_package_json "$file" "$VERSION"
done

for file in "${VERSION_ACTION_READMES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing action README: $file" >&2
    exit 1
  fi
  sync_action_readme_refs "$file" "$VERSION"
done

if git diff --quiet -- "${VERSION_PACKAGE_JSONS[@]}" "${VERSION_ACTION_READMES[@]}"; then
  echo "Version files already at $VERSION"
else
  echo "Updated version files:"
  git diff --stat -- "${VERSION_PACKAGE_JSONS[@]}" "${VERSION_ACTION_READMES[@]}"
fi
