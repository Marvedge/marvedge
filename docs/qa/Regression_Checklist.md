# Marvedge Reusable Regression Checklist

## Purpose

Use this checklist before a release and after changes affecting authentication, APIs, sessions, uploads, payments, demos, overlays, subtitles or media processing.

Record each item as:

- Pass
- Fail
- Blocked
- Not applicable

For failures, attach screenshots, request and response evidence, logs, reproduction steps and the affected commit or pull request.

## 1. Repository and Environment

- [ ] The branch is based on the latest `origin/master`.
- [ ] The current branch contains only changes relevant to its task.
- [ ] `git status --short` contains no unexpected files.
- [ ] No secrets, tokens or environment values are staged.
- [ ] Required environment variables are configured.
- [ ] Local services and external dependencies are identified.
- [ ] Test-generated reports and artifacts are ignored by Git.

Suggested commands:

```powershell
git fetch origin
git log --oneline HEAD..origin/master
git status --short
```
