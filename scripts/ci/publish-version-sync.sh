#!/usr/bin/env bash
# Commit synced version files to master and move the release tag.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=version-sync-manifest.sh
source "${SCRIPT_DIR}/version-sync-manifest.sh"

version="${1:?version required (e.g. 0.4.5)}"
default_branch="${DEFAULT_BRANCH:-master}"

VERSION_FILES=("${VERSION_PACKAGE_JSONS[@]}" "${VERSION_ACTION_READMES[@]}")

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

needs_commit=false
if ! git diff --quiet -- "${VERSION_FILES[@]}"; then
  needs_commit=true
  git add "${VERSION_FILES[@]}"
  git commit -m "chore: sync version files to v${version}"
  git push origin "HEAD:${default_branch}"
  echo "Pushed version sync commit to ${default_branch}"
else
  echo "Version files already aligned on ${default_branch}"
fi

tag_ref="v${version}"
git tag -fa "${tag_ref}" -m "Release ${tag_ref}"
git push origin "refs/tags/${tag_ref}" --force
echo "Moved tag ${tag_ref} to $(git rev-parse HEAD)"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "pushed_main=${needs_commit}"
    echo "tag_moved=true"
    echo "commit_sha=$(git rev-parse HEAD)"
  } >> "$GITHUB_OUTPUT"
fi
