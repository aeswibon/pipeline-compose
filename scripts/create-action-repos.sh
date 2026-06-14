#!/usr/bin/env bash
# Scaffold standalone GitHub Action repositories as siblings of pipeline-compose.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT="$(cd "$ROOT/.." && pwd)"

copy_license() {
  cp "$ROOT/LICENSE" "$1/LICENSE"
}

write_gitignore() {
  cat > "$1/.gitignore" <<'EOF'
node_modules/
*.log
.DS_Store
EOF
}

init_repo() {
  local dir="$1"
  mkdir -p "$dir"
  write_gitignore "$dir"
  copy_license "$dir"
  if [[ ! -d "$dir/.git" ]]; then
    git -C "$dir" init -b master >/dev/null
  fi
}

create_run_repo() {
  local dir="$PARENT/pipeline-compose-run"
  init_repo "$dir"

  cp "$ROOT/run/action.yml" "$dir/action.yml"
  cp -R "$ROOT/run/dist" "$dir/dist"
  mkdir -p "$dir/src"
  cp -R "$ROOT/src/run" "$dir/src/run"
  cp -R "$ROOT/src/compile" "$dir/src/compile"
  cp -R "$ROOT/src/lib" "$dir/src/lib"
  cp -R "$ROOT/schema" "$dir/schema"

  cat > "$dir/package.json" <<'EOF'
{
  "name": "@aeswibon/pipeline-compose-run",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "description": "Run GitHub Actions workflows in order from a pipeline YAML file",
  "scripts": {
    "build": "tsc --noEmit && pnpm run bundle",
    "bundle": "ncc build src/run/index.ts -o dist -s",
    "test": "vitest run"
  },
  "dependencies": {
    "@actions/core": "^1.11.1",
    "ajv": "^8.17.1",
    "yaml": "^2.8.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@vercel/ncc": "^0.38.3",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
EOF

  cat > "$dir/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*"]
}
EOF

  cat > "$dir/README.md" <<'EOF'
# pipeline-compose-run

Run GitHub Actions workflows in order from a pipeline YAML file. Part of [pipeline-compose](https://github.com/aeswibon/pipeline-compose).

## Usage

```yaml
- uses: aeswibon/pipeline-compose-run@v0.1.0
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    github_token: ${{ github.token }}
```

See the [pipeline-compose README](https://github.com/aeswibon/pipeline-compose) for pipeline format, stage contracts, and permissions.

## Development

```bash
pnpm install
pnpm test
pnpm run bundle
```

Commit `dist/` after changing action logic.

## License

MIT
EOF

  perl -i -pe 's/^name: Run pipeline/name: Pipeline Compose Run/' "$dir/action.yml"
  perl -i -pe 's|^description:.*|description: Run GitHub Actions workflows in order from a pipeline YAML file|' "$dir/action.yml"
}

create_compile_repo() {
  local dir="$PARENT/pipeline-compose-compile"
  init_repo "$dir"

  cp "$ROOT/compile/action.yml" "$dir/action.yml"
  cp -R "$ROOT/compile/dist" "$dir/dist"
  mkdir -p "$dir/src"
  cp -R "$ROOT/src/compile" "$dir/src/compile"
  cp -R "$ROOT/schema" "$dir/schema"

  cat > "$dir/package.json" <<'EOF'
{
  "name": "@aeswibon/pipeline-compose-compile",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "description": "Compile pipeline-compose YAML to a static GitHub Actions workflow",
  "scripts": {
    "build": "tsc --noEmit && pnpm run bundle",
    "bundle": "ncc build src/compile/index.ts -o dist -s",
    "test": "vitest run"
  },
  "dependencies": {
    "@actions/core": "^1.11.1",
    "ajv": "^8.17.1",
    "yaml": "^2.8.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@vercel/ncc": "^0.38.3",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
EOF

  cat > "$dir/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*"]
}
EOF

  cat > "$dir/README.md" <<'EOF'
# pipeline-compose-compile

Optional compile action for [pipeline-compose](https://github.com/aeswibon/pipeline-compose) — emit a static workflow YAML from pipeline YAML.

## Usage

```yaml
- uses: aeswibon/pipeline-compose-compile@v0.1.0
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    output: .github/workflows/pipeline.generated.yml
```

Most users should use [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) instead.

## Development

```bash
pnpm install
pnpm test
pnpm run bundle
```

## License

MIT
EOF

  perl -i -pe 's/^name: Compile pipeline/name: Pipeline Compose Compile/' "$dir/action.yml"
  perl -i -pe 's|default: aeswibon/pipeline-compose/compile@master|default: aeswibon/pipeline-compose-compile@master|' "$dir/action.yml"
}

create_eval_repo() {
  local dir="$PARENT/pipeline-compose-eval"
  init_repo "$dir"

  cp "$ROOT/eval/action.yml" "$dir/action.yml"
  cp -R "$ROOT/eval/dist" "$dir/dist"
  mkdir -p "$dir/src"
  cp -R "$ROOT/src/eval" "$dir/src/eval"
  cp -R "$ROOT/src/lib" "$dir/src/lib"

  cat > "$dir/package.json" <<'EOF'
{
  "name": "@aeswibon/pipeline-compose-eval",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "description": "Evaluate pipeline-compose when: expressions",
  "scripts": {
    "build": "tsc --noEmit && pnpm run bundle",
    "bundle": "ncc build src/eval/index.ts -o dist -s",
    "test": "vitest run"
  },
  "dependencies": {
    "@actions/core": "^1.11.1"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@vercel/ncc": "^0.38.3",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
EOF

  cat > "$dir/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*"]
}
EOF

  cat > "$dir/README.md" <<'EOF'
# pipeline-compose-eval

Evaluate `when:` expressions for [pipeline-compose](https://github.com/aeswibon/pipeline-compose) pipelines.

## Usage

```yaml
- uses: aeswibon/pipeline-compose-eval@v0.1.0
  with:
    expression: startsWith(github.ref, 'refs/tags/v')
    context: '{}'
    github: '{"ref":"refs/tags/v1.0.0"}'
```

## License

MIT
EOF

  perl -i -pe 's/^name: Evaluate pipeline expression/name: Pipeline Compose Eval/' "$dir/action.yml"
}

create_context_merge_repo() {
  local dir="$PARENT/pipeline-compose-context-merge"
  init_repo "$dir"

  cp "$ROOT/context/merge/action.yml" "$dir/action.yml"

  cat > "$dir/README.md" <<'EOF'
# pipeline-compose-context-merge

Composite action to merge stage outputs into a pipeline context JSON file. Used with advanced compile workflows for [pipeline-compose](https://github.com/aeswibon/pipeline-compose).

## Usage

```yaml
- uses: aeswibon/pipeline-compose-context-merge@v0.1.0
  with:
    context_file: pipeline-context.json
    stage_id: build
    outputs: '{"artifact_id":"123"}'
```

## License

MIT
EOF

  perl -i -pe 's/^name: Merge stage outputs into context/name: Pipeline Compose Context Merge/' "$dir/action.yml"
}

create_run_repo
create_compile_repo
create_eval_repo
create_context_merge_repo

echo "Created action repos under $PARENT:"
ls -d "$PARENT"/pipeline-compose-*
