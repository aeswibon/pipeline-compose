#!/usr/bin/env bash
# Apply discoverability metadata (topics + descriptions) to action repos.
set -euo pipefail

OWNER="${GH_OWNER:-aeswibon}"

configure() {
  local repo="$1"
  shift
  gh repo edit "${OWNER}/${repo}" "$@"
  echo "Configured ${OWNER}/${repo}"
}

configure pipeline-compose-run \
  --description "Run GitHub Actions workflows in order — one pipeline file, no generated YAML" \
  --add-topic github-actions --add-topic ci-cd \
  --add-topic workflow-orchestration --add-topic release-automation \
  --add-topic devops --add-topic yaml --add-topic workflow-dispatch

configure pipeline-compose-compile \
  --description "Compile pipeline YAML into a static GitHub Actions workflow with native needs" \
  --add-topic github-actions --add-topic ci-cd \
  --add-topic workflow-orchestration --add-topic yaml --add-topic codegen

configure pipeline-compose-eval \
  --description "Evaluate pipeline when: expressions against GitHub and context JSON" \
  --add-topic github-actions --add-topic ci-cd \
  --add-topic workflow-orchestration --add-topic expressions

configure pipeline-compose-context-merge \
  --description "Merge stage outputs into pipeline context JSON for composite workflows" \
  --add-topic github-actions --add-topic ci-cd \
  --add-topic workflow-orchestration --add-topic composite-actions

configure pipeline-compose \
  --description "Run GitHub Actions workflows in order — pipeline YAML orchestrator monorepo" \
  --add-topic github-actions --add-topic ci-cd \
  --add-topic workflow-orchestration --add-topic monorepo

echo "Done. Marketplace publish still requires manual 2FA — see docs/superpowers/marketplace-publish.md"
