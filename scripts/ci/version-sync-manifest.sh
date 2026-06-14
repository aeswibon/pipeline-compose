#!/usr/bin/env bash
# Shared list of files updated by sync-versions-from-tag.sh / publish-version-sync.sh.
# Examples and tutorial docs are intentionally excluded (stable demo pins).

VERSION_PACKAGE_JSONS=(
  package.json
  packages/core/package.json
  packages/cli/package.json
  packages/action-run/package.json
  packages/action-compile/package.json
  packages/action-eval/package.json
  packages/action-context-merge/package.json
)

VERSION_ACTION_READMES=(
  packages/action-run/README.md
  packages/action-compile/README.md
  packages/action-eval/README.md
  packages/action-context-merge/README.md
)
