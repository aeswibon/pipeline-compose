#!/usr/bin/env bash
# Publish workspace action packages to their GitHub repositories.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${1:-v0.3.0}"
LICENSE="$ROOT/LICENSE"

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
  git -C "$work" add -A
  git -C "$work" commit -m "Publish ${github_repo} from pipeline-compose monorepo." >/dev/null

  if gh repo view "aeswibon/${github_repo}" >/dev/null 2>&1; then
    git -C "$work" remote add origin "git@github.com:aeswibon/${github_repo}.git"
    git -C "$work" push origin master --force
  else
    gh repo create "aeswibon/${github_repo}" --public --source "$work" --remote origin --push
  fi

  if git -C "$work" rev-parse "$TAG" >/dev/null 2>&1; then
    git -C "$work" push origin "$TAG" --force
  else
    git -C "$work" tag -a "$TAG" -m "Release ${TAG}"
    git -C "$work" push origin "$TAG"
  fi

  echo "Published aeswibon/${github_repo}@${TAG}"
}

publish action-run pipeline-compose-run
publish action-compile pipeline-compose-compile
publish action-eval pipeline-compose-eval
publish action-context-merge pipeline-compose-context-merge

echo "All action packages published."
