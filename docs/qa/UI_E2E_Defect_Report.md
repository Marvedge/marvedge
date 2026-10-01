# Marvedge UI/E2E Test and Defect Report

## 1. Report Information

| Field                          | Value                                         |
| ------------------------------ | --------------------------------------------- |
| Product                        | Marvedge                                      |
| Test area                      | Public authentication UI                      |
| Test framework                 | Playwright 1.63.0                             |
| Browser                        | Chromium                                      |
| Application framework          | Next.js 15.5.26                               |
| Test branch                    | `qa/test-runner-and-regression-docs`          |
| Baseline pull request          | https://github.com/Marvedge/marvedge/pull/398 |
| Expanded baseline pull request | https://github.com/Marvedge/marvedge/pull/411 |
| Test environment               | Local development environment                 |
| Report date                    | 30 September 2026                             |
| Tester                         | Pulkit Sharma                                 |

## 2. Objective

This phase established a repeatable browser-level regression baseline for Marvedge’s public authentication workflows.

The automated tests cover:

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

| Test suite         | Test file                        |  Tests | Result     |
| ------------------ | -------------------------------- | -----: | ---------- |
| Sign-in UI         | `e2e/auth-ui.spec.ts`            |      7 | Passed     |
| Signup UI          | `e2e/signup-ui.spec.ts`          |     10 | Passed     |
| Forgot-password UI | `e2e/forgot-password-ui.spec.ts` |      8 | Passed     |
| Reset-password UI  | `e2e/reset-password-ui.spec.ts`  |     11 | Passed     |
| **Total**          |                                  | **36** | **Passed** |

Final execution result:

```text
36 passed
0 failed
```

Command used:

```powershell
npm run test:e2e -- --workers=1
```

## 4. Coverage Details

### Sign-in

- Renders the required authentication controls.
- Prevents empty-form submission.
- Rejects invalid email addresses before calling the authentication API.
- Toggles password visibility.
- Opens the signup page.
- Opens the forgot-password page.
- Does not display internal database errors to the user.

### Signup

- Renders all signup controls.
- Prevents empty-form submission.
- Rejects invalid email addresses before calling the signup API.
- Rejects passwords shorter than eight characters.
- Rejects mismatched password confirmation.
- Toggles both password fields.
- Prefills name and email from query parameters.
- Redirects to sign-in after successful signup.
- Displays a safe generic message when signup fails.
- Opens the sign-in page.

### Forgot password

- Renders the password-recovery controls.
- Prevents empty-form submission.
- Rejects invalid email addresses before calling the reset API.
- Sends the correct email payload.
- Shows the sign-in action after a successful request.
- Opens sign-in after a successful reset request.
- Displays controlled API errors.
- Displays a generic message when the API cannot be reached.

### Reset password

- Renders the reset-password controls.
- Prefills the email from the reset link.
- Prevents empty-form submission.
- Rejects invalid email addresses.
- Rejects short passwords.
- Rejects mismatched passwords.
- Rejects submission when the reset token is missing.
- Toggles password visibility.
- Sends the expected reset payload and redirects after success.
- Displays a controlled invalid-or-expired-token error.
- Displays a generic message when the API cannot be reached.

## 5. Defects and Findings

### AUTH-UI-001 — Internal authentication errors exposed to users

The sign-in flow could display authentication or database implementation details returned by the server.

**Risk:** Internal infrastructure information could be exposed to users and attackers.

**Resolution:** Server-side authentication errors are converted to controlled messages, and the client displays only approved authentication messages.

**Status:** Fixed through pull request #399.

### QA-RUNNER-001 — Vitest attempted to execute Playwright suites

Vitest’s default discovery could include files under `e2e/`, causing Playwright’s `test.describe()` suites to be executed by the wrong test runner.

**Impact:** `npm test` could fail for reasons unrelated to application behaviour after Playwright tests were introduced.

**Resolution:** `e2e/**` is excluded from Vitest while retaining Vitest’s standard default exclusions.

**Status:** Fixed through pull request #411.

### QA-RUNNER-002 — Standalone AVS script executed by Vitest

Vitest’s default discovery included `cloudrun-worker/avs_dub.test.js`, even though this file is a standalone Node.js test script with its own assertion counters and explicit `process.exit()` result.

**Impact:** The script completed all 40 AVS pacing checks successfully but Vitest still classified the file as a failed suite because it intercepted `process.exit(0)`. This created a false-negative result for `npm test` and obscured genuine repository failures.

**Resolution:** The standalone script is excluded from Vitest discovery and is executed independently through `npm run test:avs`. Vitest continues to run its normal unit and integration suites, while the AVS script reports its own exit status.

**Validation:** Standalone execution completed with 40 passed and 0 failed.

**Status:** Fixed on `qa/automation-and-validation`; pull request pending.

### SUB-QA-001 — Subtitle parity assertion did not match translated wrapping behaviour

A subtitle parity test expected language-specific output to remain completely byte-identical after translated tracks intentionally changed from `WrapStyle: 2` to `WrapStyle: 1`.

**Impact:** The suite reported a false regression even though the production behaviour was intentional.

**Resolution:** The test preserves byte-identity checks for absent languages, verifies `WrapStyle: 1` for translated tracks and separately confirms that LTR dialogue text remains unchanged.

**Status:** Fixed through pull request #409.

## 6. Execution Observation

A six-worker Playwright run following dependency installation produced two sign-in timeouts while Next.js rebuilt its development cache. The remaining 34 tests passed.

The two failed cases passed when rerun with one worker, and the complete serial execution subsequently passed 36 of 36 tests.

This was classified as a local cold-start/concurrency observation rather than a confirmed product defect.

## 7. Test Environment Limitation

The local `DATABASE_URL` is empty. Database-backed positive authentication flows cannot currently be executed against a real local database.

Playwright route interception is therefore used to test deterministic browser behaviour for:

- Successful API responses
- Controlled failures
- Request payloads
- Client-side validation
- Navigation and redirects
- Prevention of internal error disclosure

This browser baseline does not replace integration testing against an approved QA or staging database.

## 8. Regression Result

The public authentication UI baseline passed:

```text
Test files: 4
Tests: 36 passed
Failures: 0
```

The authentication UI is suitable for repeatable regression testing within the documented scope.

## 9. Remaining Work

- Execute authenticated positive flows against an approved QA database.
- Verify password-reset email delivery using sandbox email credentials.
- Verify session persistence and invalidation with real accounts.
- Test cross-user and cross-tenant authorization.
- Validate the new GitHub Actions workflow through its pull request and monitor initial CI stability.
- Resolve the two truncated upstream files through the existing Task 82 work before requiring the unit-test check.
- Extend E2E coverage to authenticated product workflows.
