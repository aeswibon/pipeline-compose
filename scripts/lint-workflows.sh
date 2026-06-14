#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v actionlint >/dev/null 2>&1; then
  echo "actionlint is not installed. See https://github.com/rhysd/actionlint" >&2
  exit 1
fi

if ! command -v yamllint >/dev/null 2>&1; then
  echo "yamllint is not installed. See https://yamllint.readthedocs.io/" >&2
  exit 1
fi

actionlint .github/workflows/*.yml .github/act/workflows/*.yml examples/**/.github/workflows/*.yml
yamllint -c .yamllint.yml .github/workflows/ .github/act/workflows/ .github/pipelines/ examples/**/.github/
