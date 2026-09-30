# Marvedge UI/E2E Test and Defect Report

## 1. Report Information

| Field | Value |
|---|---|
| Product | Marvedge |
| Test area | Public authentication UI |
| Test framework | Playwright 1.63.0 |
| Browser | Chromium |
| Application framework | Next.js 15.5.19 |
| Test branch | `qa/playwright-e2e-baseline` |
| Pull request | https://github.com/Marvedge/marvedge/pull/398 |
| Test environment | Local development environment |
| Report date | 28 September 2026 |
| Tester | Pulkit Sharma |

## 2. Objective

The objective of this test phase was to establish a repeatable browser-level regression baseline for Marvedge’s public authentication workflows.

The tests verify user-visible behaviour across:

- Sign-in
- Signup
- Forgot password
- Reset password
- Client-side validation
- Password visibility controls
- Navigation between authentication pages
- API request payloads
- Successful API responses
- Controlled API failures
- Prevention of internal error disclosure

## 3. Automated Test Summary

| Test suite | Test file | Test count | Result |
|---|---|---:|---|
| Sign-in UI | `e2e/auth-ui.spec.ts` | 7 | Passed |
| Signup UI | `e2e/signup-ui.spec.ts` | 10 | Passed |
| Forgot-password UI | `e2e/forgot-password-ui.spec.ts` | 8 | Passed |
| Reset-password UI | `e2e/reset-password-ui.spec.ts` | 11 | Passed |
| **Total** |  | **36** | **Passed** |

Final execution result:

```text
36 passed
0 failed