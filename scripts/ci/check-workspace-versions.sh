#!/usr/bin/env bash
# Fail when workspace package.json versions differ from the latest release tag.
# Version bumps happen in CI (version-sync on tag push), not in feature commits.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=version-sync-manifest.sh
source "${SCRIPT_DIR}/version-sync-manifest.sh"

cd "$ROOT"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not a git repository" >&2
  exit 1
fi

latest_tag="$(git describe --tags --abbrev=0 2>/dev/null || true)"
if [[ -z "$latest_tag" ]]; then
  echo "No release tags found; skipping workspace version check." >&2
  exit 0
fi

expected="${latest_tag#v}"
if ! [[ "$expected" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Latest tag is not semver: $latest_tag" >&2
  exit 1
fi

echo "Latest release tag: $latest_tag (expect package.json version $expected)"

read_package_version() {
  perl -ne 'print $1 if /"version"\s*:\s*"([^"]+)"/' "$1"
}

failed=0
workspace_version=""
for file in "${VERSION_PACKAGE_JSONS[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing $file" >&2
    failed=1
    continue
  fi
  actual="$(read_package_version "$file")"
  if [[ -z "$workspace_version" ]]; then
    workspace_version="$actual"
  elif [[ "$actual" != "$workspace_version" ]]; then
    echo "Inconsistent version in $file: expected $workspace_version, got ${actual:-<missing>}" >&2
    failed=1
  fi
done

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

if [[ "$workspace_version" == "$expected" ]]; then
  echo "All workspace package.json files match release tag $latest_tag"
  exit 0
fi

# Release cut: tag vX.Y.Z on master before version-sync bumps package.json from the prior tag.
previous_tag="$(git tag -l 'v*' --sort=-v:refname | sed -n '2p' || true)"
if [[ -n "$previous_tag" ]]; then
  previous="${previous_tag#v}"
  if [[ "$workspace_version" == "$previous" ]]; then
    echo "Workspace at $previous_tag; newer tag $latest_tag pending version-sync — ok"
    exit 0
  fi
fi

for file in "${VERSION_PACKAGE_JSONS[@]}"; do
  actual="$(read_package_version "$file")"
  echo "Version mismatch in $file: expected $expected (from $latest_tag), got ${actual:-<missing>}" >&2
done
exit 1
