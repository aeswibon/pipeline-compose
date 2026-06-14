#!/usr/bin/env bash
# Create GitHub repos and push action repositories.
set -euo pipefail

PARENT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TAG="${1:-v0.1.0}"

publish_repo() {
  local name="$1"
  local desc="$2"
  local dir="$PARENT/$name"

  if [[ ! -d "$dir" ]]; then
    echo "Missing $dir" >&2
    exit 1
  fi

  cd "$dir"

  if [[ -z "$(git status --porcelain)" ]] && git rev-parse HEAD >/dev/null 2>&1; then
    echo "[$name] working tree clean"
  else
    git add -A
    git commit -m "Initial ${name} action."
  fi

  if ! gh repo view "aeswibon/${name}" >/dev/null 2>&1; then
    gh repo create "aeswibon/${name}" --public --description "$desc" --source . --remote origin --push
  else
    if ! git remote get-url origin >/dev/null 2>&1; then
      git remote add origin "git@github.com:aeswibon/${name}.git"
    fi
    git push -u origin master
  fi

  if git rev-parse "$TAG" >/dev/null 2>&1; then
    git push origin "$TAG" 2>/dev/null || {
      git tag -fa "$TAG" -m "Release ${TAG}"
      git push origin "$TAG" --force
    }
  else
    git tag -a "$TAG" -m "Release ${TAG}"
    git push origin "$TAG"
  fi

  echo "[$name] https://github.com/aeswibon/${name}/releases/tag/${TAG}"
}

publish_repo pipeline-compose-run "Run GitHub Actions workflows in order from a pipeline YAML file"
publish_repo pipeline-compose-compile "Compile pipeline-compose YAML to a static GitHub Actions workflow"
publish_repo pipeline-compose-eval "Evaluate pipeline-compose when: expressions"
publish_repo pipeline-compose-context-merge "Merge stage outputs into pipeline-compose context JSON"

echo "All action repositories published."
