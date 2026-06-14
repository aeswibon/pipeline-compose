# Tutorial: Tag release pipeline with pipeline-compose-run

Run **ci → version sync → GitHub Release** in order when you push a version tag — without one giant workflow or fragile `workflow_run` chains.

## What you get

```text
git push origin v1.2.3
  └─ release.yml (one run step)
       ├─ ci.yml
       ├─ stage-version-sync.yml  → outputs version
       └─ stage-release-publish.yml ← receives version
```

## 1. Copy files

Copy this folder’s `.github/` directory into your repository root.

## 2. Permissions

Your entry workflow needs:

```yaml
permissions:
  contents: write
  actions: write
```

## 3. Customize stages

- **`ci.yml`** — your tests/lint (already has `workflow_dispatch`).
- **`stage-version-sync.yml`** — reads the tag, uploads `pipeline-compose-version-sync/outputs.json`.
- **`stage-release-publish.yml`** — creates a GitHub Release for `v${version}`.

## 4. Push a tag

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Watch **Actions → Release** — stages run in pipeline order.

## How context wiring works

In `.github/pipelines/pipeline.yml`:

```yaml
inputs:
  version: ${{ context.version-sync.version }}
```

The run action resolves this from the **version-sync** stage artifact after that stage completes.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 403 on dispatch | Add `actions: write` |
| Missing version in publish stage | Check artifact name is `pipeline-compose-version-sync` |
| Stage skipped | Verify `workflow_dispatch` on the stage workflow |

## Next steps

- [pipeline-compose-run on Marketplace](https://github.com/marketplace/actions/pipeline-compose-run)
- [Full docs/examples.md](https://github.com/aeswibon/pipeline-compose/blob/master/docs/examples.md)
