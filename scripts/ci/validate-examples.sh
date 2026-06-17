#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

validate_pipeline() {
  local pipeline_file="$1"
  local repo_root="$2"
  shift 2
  pnpm run validate "$pipeline_file" --repo-root "$repo_root" --workflows --strict "$@"
}

validate_pipeline_loose() {
  local pipeline_file="$1"
  local repo_root="$2"
  shift 2
  pnpm run validate "$pipeline_file" --repo-root "$repo_root" --workflows "$@"
}

validate_pipeline .github/pipelines/pipeline.yml .
validate_pipeline examples/run-tag-release/.github/pipelines/pipeline.yml examples/run-tag-release
validate_pipeline examples/compile-check/.github/pipelines/pipeline.yml examples/compile-check
validate_pipeline_loose examples/catalog-global/.github/pipelines/pipeline.yml examples/catalog-global
validate_pipeline_loose examples/cross-repo-dispatch/.github/pipelines/pipeline.yml examples/cross-repo-dispatch \
  --repo-tokens-file examples/cross-repo-dispatch/repo-tokens.example.json
validate_pipeline_loose examples/cross-repo-subpipeline/.github/pipelines/pipeline.yml examples/cross-repo-subpipeline \
  --repo-tokens-file examples/cross-repo-subpipeline/repo-tokens.example.json

echo "All pipeline examples validated (workflows; strict except cross-repo dispatch and catalog-global)."
