#!/usr/bin/env bash
# Publish workspace action packages to their GitHub repositories.
#
# Each action repo keeps append-only master history. Tags are immutable: republishing
# the same semver fails; bump the monorepo version and tag instead.
#
# Uses GH_TOKEN (HTTPS + gh) when set; otherwise SSH remotes for local use.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${1:-v1.0.0}"
LICENSE="$ROOT/LICENSE"
GH_OWNER="${GH_OWNER:-aeswibon}"
MONOREPO_SHA="$(git -C "$ROOT" rev-parse HEAD)"
MONOREPO_SHORT="${MONOREPO_SHA:0:7}"

if [[ -n "${GH_TOKEN:-}" ]]; then
  export GH_TOKEN
  gh auth setup-git >/dev/null 2>&1
elif ! gh auth status >/dev/null 2>&1; then
  echo "Set GH_TOKEN or authenticate gh before publishing." >&2
  exit 1
fi

git_remote_url() {
  printf 'https://github.com/%s/%s.git' "$GH_OWNER" "$1"
}

git_remote_ssh() {
  printf 'git@github.com:%s/%s.git' "$GH_OWNER" "$1"
}

remote_for_repo() {
  if [[ -n "${GH_TOKEN:-}" ]]; then
    git_remote_url "$1"
  else
    git_remote_ssh "$1"
  fi
}

remote_tag_exists() {
  local remote="$1"
  local tag="$2"
  git ls-remote --tags "$remote" "refs/tags/${tag}" | grep -q .
}

configure_git_identity() {
  local dir="$1"
  git -C "$dir" config user.name "${GIT_AUTHOR_NAME:-github-actions[bot]}"
  git -C "$dir" config user.email "${GIT_AUTHOR_EMAIL:-github-actions[bot]@users.noreply.github.com}"
}

copy_package_tree() {
  local pkg_dir="$1"
  local github_repo="$2"
  local work="$3"

  cp "$LICENSE" "$work/LICENSE"
  cp "$pkg_dir/action.yml" "$work/action.yml"

  if [[ -f "$pkg_dir/README.md" ]]; then
    cp "$pkg_dir/README.md" "$work/README.md"
  else
    cat > "$work/README.md" <<EOF
# ${github_repo}

Part of [pipeline-compose](https://github.com/aeswibon/pipeline-compose). See the main repository for documentation.
EOF
  fi

  if [[ -d "$pkg_dir/dist" ]]; then
    rm -rf "$work/dist"
    cp -R "$pkg_dir/dist" "$work/dist"
    cat > "$work/package.json" <<EOF
{
  "name": "${github_repo}",
  "private": true,
  "description": "GitHub Action published from pipeline-compose monorepo"
}
EOF
  else
    rm -rf "$work/dist"
    cat > "$work/package.json" <<EOF
{
  "name": "${github_repo}",
  "private": true
}
EOF
  fi
}

publish() {
  local pkg_name="$1"
  local github_repo="$2"
  local pkg_dir="$ROOT/packages/$pkg_name"
  local work
  work="$(mktemp -d)"
  local remote
  remote="$(remote_for_repo "$github_repo")"

  trap 'rm -rf "$work"' RETURN

  if remote_tag_exists "$remote" "$TAG"; then
    echo "Tag ${TAG} already exists on ${GH_OWNER}/${github_repo}." >&2
    echo "Tags are immutable — bump the monorepo version, tag, and publish the new semver." >&2
    exit 1
  fi

  if gh repo view "${GH_OWNER}/${github_repo}" >/dev/null 2>&1; then
    git clone --branch master --single-branch "$remote" "$work"
    configure_git_identity "$work"
  else
    git -C "$work" init -b master >/dev/null
    configure_git_identity "$work"
  fi

  copy_package_tree "$pkg_dir" "$github_repo" "$work"

  git -C "$work" add -A
  if git -C "$work" diff --staged --quiet; then
    if ! git -C "$work" rev-parse HEAD >/dev/null 2>&1; then
      echo "No commits to publish for ${github_repo} at ${TAG}." >&2
      exit 1
    fi
    echo "Tree unchanged for ${github_repo}; tagging current master HEAD for ${TAG}."
  else
    git -C "$work" commit -m "$(cat <<EOF
Publish ${github_repo} ${TAG} from pipeline-compose@${MONOREPO_SHA}

Source: aeswibon/pipeline-compose@${MONOREPO_SHORT}
EOF
)"

    if gh repo view "${GH_OWNER}/${github_repo}" >/dev/null 2>&1; then
      git -C "$work" push origin master
    else
      gh repo create "${GH_OWNER}/${github_repo}" --public --source "$work" --remote origin --push
    fi
  fi

  git -C "$work" tag -a "$TAG" -m "Release ${TAG} (pipeline-compose@${MONOREPO_SHORT})"
  git -C "$work" push origin "$TAG"

  local version="${TAG#v}"
  local notes_file
  notes_file="$(mktemp)"
  bash "${ROOT}/scripts/ci/render-action-release-notes.sh" \
    "$version" "$github_repo" "$notes_file"

  gh release create "$TAG" \
    --repo "${GH_OWNER}/${github_repo}" \
    --title "$TAG" \
    --notes-file "$notes_file" \
    --verify-tag
  rm -f "$notes_file"

  echo "Published ${GH_OWNER}/${github_repo}@${TAG} at $(git -C "$work" rev-parse --short HEAD) (from pipeline-compose@${MONOREPO_SHORT})"
}

publish action-run pipeline-compose-run
publish action-compile pipeline-compose-compile
publish action-eval pipeline-compose-eval
publish action-context-merge pipeline-compose-context-merge
publish action-export pipeline-compose-export

echo "All action packages published."
