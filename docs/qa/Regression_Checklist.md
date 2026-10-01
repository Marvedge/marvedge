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

## 2. Build and Static Validation

- [ ] Dependencies install successfully.
- [ ] The application starts without compilation errors.
- [ ] TypeScript validation passes or known unrelated failures are documented.
- [ ] ESLint completes without errors.
- [ ] `git diff --check` reports no whitespace errors.
- [ ] The staged diff contains only intended changes.

Suggested commands:

```powershell
npm ci
npx tsc --noEmit
npx eslint .
git diff --check
git diff --cached --check
git diff --cached
```

## 3. Automated Regression

- [ ] Vitest executes only unit and integration tests.
- [ ] Playwright executes only browser E2E tests.
- [ ] All relevant unit tests pass.
- [ ] All relevant E2E tests pass.
- [ ] Known unrelated failures are recorded separately.
- [ ] New behaviour has automated coverage where practical.
- [ ] Failure screenshots, videos and traces are retained.
- [ ] Flaky tests are rerun and investigated rather than silently ignored.

Suggested commands:

```powershell
npm test
npm run test:e2e -- --workers=1
```

Expected public-authentication E2E baseline:

```text
Test files: 4
Tests: 36 passed
Failures: 0
```

## 4. Sign-in

- [ ] The sign-in page renders correctly.
- [ ] Empty submission is prevented.
- [ ] Invalid email is rejected before an API call.
- [ ] Valid credentials can sign in.
- [ ] Invalid credentials produce a generic response.
- [ ] Missing accounts and incorrect passwords are indistinguishable.
- [ ] Internal database or Prisma errors are not displayed.
- [ ] Password visibility toggle works.
- [ ] Signup navigation works.
- [ ] Forgot-password navigation works.
- [ ] External callback URLs cannot cause an open redirect.
- [ ] Repeated clicks do not submit multiple login requests.

## 5. Signup

- [ ] The signup page renders correctly.
- [ ] Required fields are enforced.
- [ ] Invalid email is rejected.
- [ ] Leading and trailing email whitespace is handled consistently.
- [ ] Password-length requirements match the API.
- [ ] Mismatched passwords are rejected.
- [ ] Password visibility toggles work.
- [ ] Successful signup redirects to sign-in.
- [ ] Duplicate accounts produce a controlled response.
- [ ] Malformed JSON produces HTTP 400.
- [ ] Internal database errors are not returned to the client.
- [ ] Repeated clicks do not create multiple accounts.
- [ ] Signup rate limiting works.

## 6. Password Recovery

- [ ] The forgot-password page renders correctly.
- [ ] Empty and invalid emails are rejected.
- [ ] Existing and nonexistent accounts receive indistinguishable responses.
- [ ] Reset-request rate limiting works.
- [ ] Reset tokens expire as configured.
- [ ] Reset tokens are stored as hashes.
- [ ] Raw reset tokens are never logged.
- [ ] Missing tokens are rejected.
- [ ] Invalid and expired tokens produce controlled errors.
- [ ] Used tokens cannot be reused.
- [ ] Password-length limits are enforced.
- [ ] Password confirmation must match.
- [ ] A successful reset invalidates outstanding reset records.
- [ ] Email-service configuration details are not exposed.

## 7. Session and Authorization

- [ ] Protected pages redirect signed-out users.
- [ ] Protected APIs return HTTP 401 or 403 as appropriate.
- [ ] A user cannot access another user’s records by changing an identifier.
- [ ] Tenant and ownership checks occur server-side.
- [ ] Session cookies use appropriate security attributes.
- [ ] Sign-out invalidates the active session.
- [ ] Sensitive operations require a valid current session.
- [ ] Password changes follow the project’s session-invalidation policy.

## 8. Public APIs

- [ ] Unsupported HTTP methods return a controlled response.
- [ ] Malformed JSON does not produce HTTP 500.
- [ ] Empty required fields are rejected.
- [ ] Request body limits use UTF-8 byte length.
- [ ] Oversized bodies are rejected or silently dropped according to contract.
- [ ] Rate limits return the documented behaviour.
- [ ] Unknown resource identifiers do not disclose private records.
- [ ] Error responses do not expose stack traces or environment details.
- [ ] Public telemetry maintains its documented fire-and-forget response contract.

## 9. Uploads

- [ ] Authentication is required where expected.
- [ ] Allowed extensions are enforced.
- [ ] MIME type is validated.
- [ ] File signatures are validated.
- [ ] Unsupported files are rejected.
- [ ] Oversized files return HTTP 413.
- [ ] Upload rate limiting works.
- [ ] Upstream storage failures return a controlled server error.
- [ ] Provider error details are not exposed to clients.

## 10. Payments

- [ ] Order creation requires authentication.
- [ ] The server determines trusted plan prices.
- [ ] Invalid plans are rejected.
- [ ] Order creation is rate limited.
- [ ] Payment signatures are verified server-side.
- [ ] Payment verification cannot be replayed.
- [ ] Verification attempts are rate limited.
- [ ] Failed payment-provider calls produce controlled responses.
- [ ] Payment secrets are never returned or logged.

## 11. Demos, Media and Overlays

- [ ] Demo ownership is checked.
- [ ] Unknown demos do not expose private configuration.
- [ ] Unknown media identifiers remain hidden.
- [ ] Empty telemetry batches are safely handled.
- [ ] Unknown telemetry events are dropped safely.
- [ ] Lead submissions validate required fields.
- [ ] Lead-submission rate limiting works.
- [ ] Custom-domain routes resolve correctly.
- [ ] Overlay configuration is sanitized before use.
- [ ] Exported-media access follows ownership and visibility rules.

## 12. Subtitles and Media Processing

- [ ] Subtitle timing remains ordered.
- [ ] Minimum cue duration is enforced.
- [ ] Subtitle cues do not overlap unexpectedly.
- [ ] ASS generation remains consistent between application and worker.
- [ ] Legacy no-language output remains compatible.
- [ ] Translated tracks use the intended wrapping mode.
- [ ] LTR dialogue text is not modified with bidi marks.
- [ ] RTL dialogue receives the required bidi handling.
- [ ] Animation override tags are preserved.
- [ ] Worker failures produce controlled job statuses.
- [ ] Voice-over duration and source-video duration remain synchronized.
- [ ] Extreme pacing ratios produce the intended stretch, freeze or silence behaviour.

## 13. Database Validation

Run these checks only in an approved QA or staging environment.

- [ ] Created records contain the expected normalized values.
- [ ] Failed requests do not create partial records.
- [ ] Foreign-key relationships remain valid.
- [ ] Deleted users do not leave prohibited dependent records.
- [ ] Reset tokens are stored only as hashes.
- [ ] Used or expired reset records are removed as intended.
- [ ] Duplicate requests do not create unintended duplicate records.
- [ ] Tenant-owned records remain isolated.
- [ ] Test data is clearly marked and removable.
- [ ] Database checks do not modify production data.

## 14. External Integrations

- [ ] Email delivery works with sandbox credentials.
- [ ] Upload-provider success and failure responses are handled.
- [ ] Redis-backed rate limiting behaves as documented.
- [ ] Payment-provider sandbox callbacks are verified.
- [ ] Cloud-storage access uses approved test buckets.
- [ ] Audio and voice providers use sandbox or controlled test resources.
- [ ] Provider secrets are never written to logs or test artifacts.
- [ ] Provider outages produce controlled, retryable failures where appropriate.

## 15. Browser and Responsive Validation

- [ ] Critical workflows pass in Chromium.
- [ ] Critical workflows pass in Firefox.
- [ ] Critical workflows pass in WebKit or approved Safari coverage.
- [ ] Mobile viewport layouts remain usable.
- [ ] Keyboard navigation works for critical controls.
- [ ] Focus indicators remain visible.
- [ ] Form controls have accessible names.
- [ ] Validation and toast messages are visible and understandable.

## 16. Evidence and Defect Recording

For every discovered defect, record:

- Type Of Bug
- Bug ID
- Reported By
- Assigned To
- Describe Issue
- Fix / Resolution
- Severity
- Priority
- Status
- Reported Date
- Due Date
- Description
- Refer / Image
- PR Link

Required evidence may include:

- Screenshot
- Video
- Playwright trace
- Request and response body
- HTTP status
- Server log
- Test command and output
- Commit or pull-request link

## 17. Release Decision

- [ ] No unresolved critical defects remain.
- [ ] No unresolved high-severity security defects remain.
- [ ] All critical workflows have passed.
- [ ] Blocked tests have documented reasons and owners.
- [ ] Test evidence is attached.
- [ ] Known limitations are documented.
- [ ] The final result is recorded as Go, Conditional Go or No-Go.

## 18. Current Baseline Limitations

- Database-backed positive tests require an approved QA `DATABASE_URL`.
- Cross-user and tenant-isolation execution requires standardized QA accounts.
- Email, upload, payment and voice integrations require sandbox credentials.
- Current Playwright automation covers public authentication workflows only.
- Browser automation currently runs against Chromium.
