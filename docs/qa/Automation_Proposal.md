# Marvedge QA Automation Proposal

## 1. Purpose

This proposal defines a staged automation strategy for Marvedge. Its goals are to:

- Detect regressions before merge.
- Keep feedback fast enough for daily development.
- Separate unit, integration and browser test responsibilities.
- Preserve useful failure evidence.
- Avoid requiring production credentials in CI.
- Expand toward database and external-integration testing when approved QA access becomes available.

## 2. Current Baseline

Marvedge currently has:

- Vitest unit and integration suites.
- Playwright browser automation.
- A public-authentication E2E baseline of 36 tests.
- API testing through a Postman collection.
- Subtitle and media-processing tests.
- A reusable regression checklist.
- An initial GitHub Actions QA workflow is implemented on the current branch.
- No approved local QA database credentials.
- No standardized CI sandbox credentials for email, payments, uploads or voice providers.

Current test commands:

```powershell
npm test
npm run test:e2e
npx tsc --noEmit
npx eslint .
git diff --check
```

## 3. Automation Principles

1. Fast checks should run before expensive checks.
2. Pull requests should receive deterministic feedback.
3. Unit tests and Playwright tests must use separate runners.
4. Tests must not depend on production services.
5. Secrets must be stored only in approved CI secret storage.
6. Failure evidence must be retained.
7. Flaky tests must be investigated, not hidden with unlimited retries.
8. Destructive database tests must run only against disposable QA data.
9. A failing required check must block merge.
10. Known infrastructure limitations must be visible rather than silently ignored.

## 4. Proposed Automation Layers

### Layer 1 — Static validation

Purpose: detect formatting, linting and type errors quickly.

Checks:

- Dependency installation using `npm ci`
- Prisma client generation
- TypeScript validation
- ESLint
- Whitespace validation where practical
- Secret-scanning through GitHub-supported tooling

Target duration: under five minutes.

Trigger:

- Every pull request
- Every push to `master`

### Layer 2 — Unit and integration tests

Purpose: validate application logic without a browser.

Checks:

- Vitest suites
- Subtitle generation
- Overlay logic
- Validation utilities
- CRM utilities
- Upload-route tests
- Audio-job logic

Trigger:

- Every pull request
- Every push to `master`

Test artifacts:

- Test output
- Coverage report when coverage thresholds are introduced

### Layer 3 — Browser smoke tests

Purpose: confirm critical user-visible workflows.

Initial scope:

- Sign-in
- Signup
- Forgot password
- Reset password

Command:

```powershell
npm run test:e2e -- --workers=1
```

A single worker is recommended initially because the local Next.js cold-build produced timeouts when six workers loaded the same route concurrently. Worker count can be increased after CI timing data is collected.

Trigger:

- Every pull request affecting authentication, shared UI, middleware or E2E code
- Every push to `master`
- Manual workflow dispatch

Artifacts retained on failure:

- Screenshots
- Videos
- Playwright traces
- HTML report

### Layer 4 — API contract tests

Purpose: validate status codes, response shapes, privacy controls and malformed-input handling.

Initial scope:

- Authentication negative cases
- Public telemetry
- Leads
- Uploads
- Payment validation
- Owner-scoped endpoints
- Unsupported HTTP methods

Implementation options:

- Newman execution of the existing Postman collection
- Vitest route-level tests for deterministic contracts

Trigger:

- Every pull request affecting `app/api/**`
- Nightly execution
- Pre-release execution

### Layer 5 — Database validation

Purpose: verify persistence, normalization, foreign keys and tenant isolation.

Requirements:

- Approved QA or staging `DATABASE_URL`
- Disposable or clearly marked test records
- Standardized User A and User B accounts
- Cleanup permissions
- No production database access

Checks:

- Expected records are created.
- Failed requests do not create partial records.
- Reset tokens are hashed.
- Used tokens cannot be reused.
- Foreign-key relationships remain valid.
- Account deletion follows intended cascade behaviour.
- Cross-user and cross-tenant access is blocked.
- Duplicate requests do not create unintended duplicates.

Trigger:

- Nightly
- Manual workflow dispatch
- Pre-release

### Layer 6 — External integration tests

Purpose: validate provider contracts without production impact.

Required sandboxes:

- Resend or approved email sandbox
- Cloudinary/GCS test storage
- Redis QA instance
- Payment-provider sandbox
- Voice/audio-provider sandbox

Checks:

- Success responses
- Authentication failures
- Provider outages
- Rate limiting
- Retry behaviour
- Safe error messages
- Webhook signature verification
- Secret redaction

Trigger:

- Nightly
- Manual execution
- Pre-release

## 5. Execution Schedule

| Pipeline                    | Trigger          | Scope                                                      | Merge blocking            |
| --------------------------- | ---------------- | ---------------------------------------------------------- | ------------------------- |
| Pull-request fast checks    | Every PR         | Install, Prisma generation, typecheck, lint and unit tests | Yes                       |
| Pull-request browser checks | Relevant PRs     | Chromium authentication smoke suite                        | Yes after stabilization   |
| Master regression           | Push to `master` | Static checks, unit tests and Chromium E2E                 | Yes                       |
| Nightly regression          | Scheduled        | Full API, database, integration and browser suite          | No, but creates alerts    |
| Pre-release regression      | Manual           | Full supported matrix and database validation              | Release decision          |
| Weekly security checks      | Scheduled        | Dependency, secret and authorization checks                | Creates security findings |

## 6. Browser Strategy

### Initial phase

- Chromium
- Desktop viewport
- One Playwright worker
- No retries locally
- One CI retry only after infrastructure stability is measured

### Expansion phase

- Firefox
- WebKit
- Mobile Chromium viewport
- Keyboard-navigation checks
- Accessible-name checks

Browser expansion should occur after the Chromium baseline remains stable across multiple CI runs.

## 7. Test Data Strategy

Test data should be:

- Clearly identifiable as QA data.
- Created through fixtures or approved setup scripts.
- Independent between tests.
- Removed after execution.
- Safe to rerun.
- Isolated from production.
- Unique when parallel execution is enabled.

Recommended test identities:

- `qa-user-a`
- `qa-user-b`
- `qa-tenant-a`
- `qa-tenant-b`
- `qa-admin`

Passwords and provider tokens must be stored in CI secrets rather than source control.

## 8. Secret and Environment Management

Required future CI secrets may include:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- Redis connection configuration
- Email sandbox API key
- Upload-provider sandbox credentials
- Payment sandbox keys and webhook secret
- Audio or voice-provider sandbox credentials

Rules:

- Never commit `.env` files.
- Never print secrets in test output.
- Use least-privilege credentials.
- Rotate credentials if exposed.
- Use environment-specific test resources.
- Do not reuse production secrets in pull-request workflows.
- Restrict workflows that use secrets from untrusted forked pull requests.

## 9. Failure Evidence

For failed browser tests, upload:

- `playwright-report/`
- `test-results/`
- Screenshots
- Videos
- Trace archives

For failed API or integration tests, retain:

- Endpoint name
- HTTP method
- Sanitized request
- Status code
- Sanitized response
- Correlation identifier where available

Secrets, reset tokens, passwords and private user data must be redacted.

## 10. Flaky-Test Policy

A test is considered potentially flaky when it produces different results against the same commit and environment.

Process:

1. Rerun the individual failure once.
2. Inspect its trace, screenshot, video and application log.
3. Determine whether the cause is product, test or infrastructure.
4. Record the finding.
5. Fix deterministic timing or isolation problems.
6. Quarantine only with an owner and review date.
7. Never convert a failing test into an unconditional pass.

The two cold-start sign-in timeouts observed locally passed serially and are currently classified as an environment/concurrency observation.

## 11. Prioritization

### Priority 1 — Immediate

- Add GitHub Actions workflow.
- Run deterministic static validation.
- Run Vitest separately from Playwright.
- Run the 36-test Chromium authentication suite.
- Upload Playwright artifacts on failure.
- Document known blockers.

### Priority 2 — After QA access is granted

- Add database validation.
- Add two-user tenant-isolation testing.
- Add Redis rate-limit verification.
- Add password-reset email delivery testing.
- Add upload and payment sandbox tests.

### Priority 3 — Coverage expansion

- Add authenticated dashboard journeys.
- Add demo creation and sharing.
- Add upload and export journeys.
- Add payment journeys.
- Add lead and overlay journeys.
- Expand browser coverage.

### Priority 4 — Quality metrics

- Add unit-test coverage reporting.
- Introduce justified coverage thresholds.
- Track flaky-test rate.
- Track regression-escape rate.
- Track average defect resolution time.
- Track CI duration and failure causes.

## 12. Initial CI Implementation

The implemented `.github/workflows/qa.yml` workflow provides:

- Manual execution.
- Pull-request execution.
- Push execution on `master`.
- Node dependency caching.
- Prisma client generation.
- Static validation.
- Vitest execution.
- Playwright Chromium execution.
- Playwright artifact upload on failure.

Database and provider-dependent jobs should not be enabled until approved sandbox access is available.

## 13. Success Criteria

The first automation phase is successful when:

- Every pull request receives repeatable QA feedback.
- Unit tests and E2E tests run through their correct runners.
- The 36-test authentication baseline passes in CI.
- Failures include enough evidence to diagnose them.
- No production secrets or services are required.
- Known failures are visible and assigned.
- Developers can reproduce CI commands locally.

## 14. Current Limitations

- No approved QA database connection.
- No standardized multi-user fixtures.
- No integration sandbox credentials.
- Browser coverage is Chromium-only.
- Authentication E2E responses are mocked.
- The standalone AVS pacing script is excluded from Vitest and executed through `npm run test:avs`.
- Two upstream files on `master` are currently truncated; complete repairs exist on the unmerged Task 82 branch.

## 15. Recommended Next Step

Validate the initial GitHub Actions workflow through its pull request, monitor its first executions and resolve the upstream Task 82 blockers. After the workflow is stable, configure the static-validation, unit-tests and browser-tests jobs as required branch-protection checks. Database and external-provider jobs must remain disabled until approved QA access is supplied.
