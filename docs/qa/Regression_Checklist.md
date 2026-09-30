# Marvedge Reusable Regression Checklist

## Purpose

Use this checklist before a release, after authentication changes, or after merging changes that affect APIs, sessions, uploads, payments, demos, overlays or media processing.

Record each item as:

- Pass
- Fail
- Blocked
- Not applicable

When an item fails, attach screenshots, request/response evidence, logs and reproduction steps.

---

## 1. Build and Static Validation

- [ ] Dependencies install successfully.
- [ ] Application starts without compilation errors.
- [ ] TypeScript validation passes.
- [ ] ESLint completes without errors.
- [ ] `git diff --check` reports no whitespace errors.
- [ ] No secrets or environment values are committed.
- [ ] No unexpected generated files are staged.

Suggested commands:

```powershell
npm ci
npx tsc --noEmit
npx eslint .
git diff --check
git status --short