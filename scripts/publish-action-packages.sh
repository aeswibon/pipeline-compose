#!/usr/bin/env bash
# Publish workspace action packages to their GitHub repositories.
# Uses GH_TOKEN (HTTPS + gh) when set; otherwise SSH remotes for local use.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${1:-v0.3.1}"
LICENSE="$ROOT/LICENSE"
GH_OWNER="${GH_OWNER:-aeswibon}"

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

publish() {
  local pkg_name="$1"
  local github_repo="$2"
  local pkg_dir="$ROOT/packages/$pkg_name"
  local work
  work="$(mktemp -d)"

  trap 'rm -rf "$work"' RETURN

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
    cp -R "$pkg_dir/dist" "$work/dist"
    cat > "$work/package.json" <<EOF
{
  "name": "${github_repo}",
  "private": true,
  "description": "GitHub Action published from pipeline-compose monorepo"
}
EOF
  else
    cat > "$work/package.json" <<EOF
{
  "name": "${github_repo}",
  "private": true
}
EOF
  fi

  git -C "$work" init -b master >/dev/null
  git -C "$work" config user.name "${GIT_AUTHOR_NAME:-github-actions[bot]}"
  git -C "$work" config user.email "${GIT_AUTHOR_EMAIL:-github-actions[bot]@users.noreply.github.com}"
  git -C "$work" add -A
  git -C "$work" commit -m "Publish ${github_repo} from pipeline-compose monorepo." >/dev/null

  local remote
  if [[ -n "${GH_TOKEN:-}" ]]; then
    remote="$(git_remote_url "$github_repo")"
  else
    remote="git@github.com:${GH_OWNER}/${github_repo}.git"
  fi

  if gh repo view "${GH_OWNER}/${github_repo}" >/dev/null 2>&1; then
    git -C "$work" remote add origin "$remote"
    git -C "$work" push origin master --force
  else
    gh repo create "${GH_OWNER}/${github_repo}" --public --source "$work" --remote origin --push
  fi

  git -C "$work" tag -fa "$TAG" -m "Release ${TAG}"
  git -C "$work" push origin "$TAG" --force

  local version="${TAG#v}"
  local notes_file
  notes_file="$(mktemp)"
  bash "${ROOT}/scripts/ci/render-action-release-notes.sh" \
    "$version" "$github_repo" "$notes_file"

  if gh release view "$TAG" --repo "${GH_OWNER}/${github_repo}" >/dev/null 2>&1; then
    gh release edit "$TAG" \
      --repo "${GH_OWNER}/${github_repo}" \
      --notes-file "$notes_file"
    echo "Updated release notes for ${GH_OWNER}/${github_repo}@${TAG}"
  else
    gh release create "$TAG" \
      --repo "${GH_OWNER}/${github_repo}" \
      --title "$TAG" \
      --notes-file "$notes_file" \
      --verify-tag
    echo "Created release ${GH_OWNER}/${github_repo}@${TAG}"
  fi
  rm -f "$notes_file"

  echo "Published ${GH_OWNER}/${github_repo}@${TAG}"
}

publish action-run pipeline-compose-run
publish action-compile pipeline-compose-compile
publish action-eval pipeline-compose-eval
publish action-context-merge pipeline-compose-context-merge
publish action-export pipeline-compose-export

echo "All action packages published."
