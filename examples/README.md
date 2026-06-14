# Examples

Copy-paste templates for each [pipeline-compose](https://github.com/aeswibon/pipeline-compose) action. Each folder is self-contained: read the tutorial, then copy `.github/` into your repository.

| Example | Action | Use case |
|---------|--------|----------|
| [run-tag-release](run-tag-release/) | [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) | Tag push → ci → version → GitHub Release |
| [cross-repo-dispatch](cross-repo-dispatch/) | [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) | Dispatch a stage in another repo via `repo:` + `repo_tokens_json` |
| [compile-check](compile-check/) | [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) | Keep a generated workflow in sync with pipeline YAML |
| [eval-conditional](eval-conditional/) | [pipeline-compose-eval](https://github.com/aeswibon/pipeline-compose-eval) | Gate jobs with `when:` expressions |
| [context-merge-manual](context-merge-manual/) | [pipeline-compose-context-merge](https://github.com/aeswibon/pipeline-compose-context-merge) | Build pipeline context JSON across steps |

```bash
# Quick copy (from a clone of pipeline-compose)
cp -R examples/run-tag-release/.github /path/to/your-repo/
```
