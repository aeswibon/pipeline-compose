# GitHub App setup (~3 minutes)

Use a **bring-your-own GitHub App** when `repo_tokens_json` PATs are too brittle or you dispatch to many repositories. `pipeline-compose-run` mints short-lived installation tokens per `repo:` stage.

## 1. Create the App

1. GitHub → **Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**
2. Name: e.g. `my-org-pipeline-dispatch`
3. **Webhook:** disable (unchecked) unless you need it elsewhere
4. **Repository permissions:**
   - **Actions:** Read and write
   - **Contents:** Read-only (workflow file digest on smart rerun)
   - **Metadata:** Read-only (default)
5. **Where can this GitHub App be installed?** — Only on this account, or Any account if you dispatch org-wide
6. Create the app → **Generate a private key** (download `.pem`) → note the **App ID**

## 2. Install on target repos

**Install App** → select the host repo and every **target** repo referenced by `repo:` in your pipeline.

The installation token is scoped per repo; the action resolves the correct installation for each slug.

## 3. Store secrets on the host repo

| Secret | Value |
|--------|--------|
| `PIPELINE_APP_ID` | App ID (numeric) |
| `PIPELINE_APP_PRIVATE_KEY` | Full PEM contents |

## 4. Wire `pipeline-compose-run`

```yaml
- uses: aeswibon/pipeline-compose-run@v1.16.0
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    github_token: ${{ github.token }}
    github_app_id: ${{ secrets.PIPELINE_APP_ID }}
    github_app_private_key: ${{ secrets.PIPELINE_APP_PRIVATE_KEY }}
```

Same-repo stages still use `github.token`. Cross-repo stages use the App installation token for that slug.

## 5. Validate before merge

```bash
export GITHUB_TOKEN=ghp_...   # needs read access to every repo: slug
pipeline-compose validate .github/pipelines/pipeline.yml --strict --check-repo-access
```

`--check-repo-access` calls the GitHub API for each `repo:` slug (including nested `pipeline_file` bundles) and fails if the token cannot read the repository.

## PAT vs App

| | PAT (`repo_tokens_json`) | GitHub App |
|--|--------------------------|------------|
| Rotation | Manual per slug | Central key + install list |
| Scope | One token per repo map entry | Per-repo installation token |
| Org-wide | Many secrets | One App, many installs |

Full cross-repo walkthrough: [cross-repo-pipeline.md](./cross-repo-pipeline.md).
