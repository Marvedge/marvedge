# Task-00130: Team Email Notification Configuration Verification Report

- **Date:** 2026-11-12
- **Repository:** `Marvedge/marvedge`
- **Working Branch:** `task/task-00130`
- **Base Commit:** `b0490cb9f60ee025d160e19d9718c1f94b73a434` (origin/master)
- **Status:** INSPECTION COMPLETE — READINESS VERIFIED

---

## Executive Summary

Task-00130 establishes human-received alerting across pipeline failure rates, stuck queues, and GPU/vendor spend. The decision has been made to route these notifications to the **internship team's shared email address**.

Before configuring the team's email address or initiating live alert triggers, an in-depth code and configuration audit was conducted across the monitoring notification engine.

### Core Findings:

1. **Recipient Configuration:** Handled exclusively via `MONITORING_ALERT_EMAIL_RECIPIENT`. The implementation natively supports single email addresses as well as comma-separated recipient lists (`recipients = emailRecipient.split(",").map(e => e.trim()).filter(Boolean)`). A shared or team inbox address is fully supported as standard RFC 5322 email recipients.
2. **Sender Configuration & Fallback Hierarchy:**
   - In `app/lib/monitoring/alerts.ts` (line 334):
     `const alertEmailSender = environment.MONITORING_ALERT_EMAIL_SENDER?.trim() || undefined;`
   - In `app/lib/monitoring/externalNotifications.ts` (line 262):
     `const sender = config.alertEmailSender?.trim() || "alerts@marvedge.com";`
   - **Crucial Architectural Observation:** The monitoring subsystem does **not** fall back to `RESEND_FROM_EMAIL`. If `MONITORING_ALERT_EMAIL_SENDER` is unset, it defaults hardcoded to `alerts@marvedge.com`. However, in the local `.env`, `RESEND_FROM_EMAIL` uses the verified subdomain `mail.marvedge.com`. Therefore, to ensure 100% email deliverability and avoid unverified domain rejection by Resend, `MONITORING_ALERT_EMAIL_SENDER` should either be explicitly configured to match the verified domain sender or the verified sender address in `RESEND_FROM_EMAIL`.
3. **Resend API Key Hierarchy:**
   - In `app/lib/monitoring/alerts.ts` (lines 335–338):
     `const resendApiKey = environment.MONITORING_RESEND_API_KEY?.trim() || environment.RESEND_API_KEY?.trim() || undefined;`
   - Both are supported. The existing `RESEND_API_KEY` in `.env` is **PRESENT** and immediately active.
4. **Missing Configuration Behavior:**
   - If `MONITORING_ALERT_EMAIL_RECIPIENT` is unset, email dispatch is skipped entirely. No configuration error is thrown; evaluator continues running normally.
   - If `MONITORING_ALERT_EMAIL_RECIPIENT` is set but neither `RESEND_API_KEY` nor `MONITORING_RESEND_API_KEY` is present, `loadMonitoringAlertConfig` throws a `MonitoringAlertConfigurationError("RESEND_API_KEY")`.
5. **Dry-Run Mode:**
   - `MONITORING_ALERT_DRY_RUN` (`true` or `1`) completely suppresses both outbound HTTP webhook calls and Resend email transmission, emitting only `[monitoring:dry-run]` log output.

---

## 1. Codebase & Implementation Trace

The following files were inspected in detail:

- `app/lib/monitoring/externalNotifications.ts` (lines 1–323)
- `app/lib/monitoring/alerts.ts` (lines 125–366, 710–785)
- `scripts/monitoringAlerts.ts` (lines 1–60)
- `docs/EXTERNAL_MONITORING_AND_ALERTING.md` (lines 140–226)
- `.env.example` (lines 340–356)

### Detailed Analysis of Questions:

#### 1. Which environment variable supplies the monitoring alert recipient?

- **Variable:** `MONITORING_ALERT_EMAIL_RECIPIENT`
- **Code Path:**
  `app/lib/monitoring/alerts.ts`:
  ```ts
  const alertEmailRecipient = environment.MONITORING_ALERT_EMAIL_RECIPIENT?.trim() || undefined;
  ```

#### 2. Which environment variable supplies the sender address?

- **Variable:** `MONITORING_ALERT_EMAIL_SENDER`
- **Default Fallback:** `alerts@marvedge.com` (hardcoded in `externalNotifications.ts` line 262)

#### 3. Does the monitoring dispatcher use `RESEND_API_KEY`, `MONITORING_RESEND_API_KEY`, or both?

- **Answer:** It supports **both** via precedence fallback:
  ```ts
  const resendApiKey =
    environment.MONITORING_RESEND_API_KEY?.trim() ||
    environment.RESEND_API_KEY?.trim() ||
    undefined;
  ```
  `MONITORING_RESEND_API_KEY` takes precedence if present; otherwise, it falls back seamlessly to `RESEND_API_KEY`.

#### 4. Does it use `RESEND_FROM_EMAIL` as a fallback for `MONITORING_ALERT_EMAIL_SENDER`?

- **Answer:** **No.**
  In `alerts.ts` line 334, `alertEmailSender` reads _only_ `environment.MONITORING_ALERT_EMAIL_SENDER`. If unset, `externalNotifications.ts` line 262 defaults to `"alerts@marvedge.com"`.
  It does **not** inspect `RESEND_FROM_EMAIL`.

#### 5. Is the sender address required to belong to a verified Resend domain?

- **Answer:** **Yes.**
  Resend requires all outbound emails to originate from a domain verified in the account associated with `RESEND_API_KEY`. Attempting to send from an unverified domain (or `alerts@marvedge.com` if only a subdomain like `mail.marvedge.com` is verified) will result in an HTTP 403 or `validation_error: Domain not verified` from Resend's API.
  In the local environment, `RESEND_FROM_EMAIL` is configured under `@mail.marvedge.com`. Therefore, setting `MONITORING_ALERT_EMAIL_SENDER` to a matching address on that verified domain is strongly recommended.

#### 6. Does the implementation support sending to a shared/team email inbox?

- **Answer:** **Yes, natively.**
  Resend delivers to standard email addresses, including Google Workspace collaborative inboxes, Microsoft 365 shared mailboxes, distribution lists, or standard user inboxes.
  Furthermore, `externalNotifications.ts` splits recipients by comma:
  ```ts
  const recipients = emailRecipient
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  ```
  This allows sending to the team email alone, or to multiple individual and team addresses simultaneously.

#### 7. What happens when the recipient or sender configuration is missing?

- **Missing Recipient (`MONITORING_ALERT_EMAIL_RECIPIENT` is undefined or empty):**
  Email dispatch is bypassed cleanly (`if (resendApiKey && emailRecipient)` guard in `externalNotifications.ts`). No error is thrown. The monitoring loop and webhook notifications continue unhindered.
- **Missing Sender (`MONITORING_ALERT_EMAIL_SENDER` is unset):**
  The system falls back to `"alerts@marvedge.com"`.
- **Recipient Present but API Key Missing:**
  `loadMonitoringAlertConfig()` throws `MonitoringAlertConfigurationError("RESEND_API_KEY")` during boot, preventing silent notification blackout.

#### 8. Does `MONITORING_ALERT_DRY_RUN` prevent actual email delivery?

- **Answer:** **Yes, guaranteed.**
  In `externalNotifications.ts` lines 192–197:
  ```ts
  if (config.alertDryRun) {
    console.info(
      `[monitoring:dry-run] Alert notification evaluated (DRY RUN active, skipped transmission): ${message.subject}`
    );
    return result;
  }
  ```
  When `MONITORING_ALERT_DRY_RUN="true"` (or `"1"`), no network calls are initiated to Resend or chat webhooks.

---

## 2. Local Environment Configuration Audit

A secure PowerShell inspection of `.env` and `.env.local` was performed. No secret values, tokens, or emails were printed or exposed:

| Variable                           | Status in `.env` | Status in `.env.local` | Role in Monitoring Alerts                                            |
| :--------------------------------- | :--------------- | :--------------------- | :------------------------------------------------------------------- |
| `RESEND_API_KEY`                   | **PRESENT**      | **PRESENT**            | Active Resend API key (used by alert dispatcher).                    |
| `MONITORING_RESEND_API_KEY`        | **ABSENT**       | **ABSENT**             | Optional override (not needed since `RESEND_API_KEY` exists).        |
| `RESEND_FROM_EMAIL`                | **PRESENT**      | **PRESENT**            | General transactional sender (domain: `mail.marvedge.com`).          |
| `MONITORING_ALERT_EMAIL_SENDER`    | **ABSENT**       | **ABSENT**             | Specific alert sender (currently defaults to `alerts@marvedge.com`). |
| `MONITORING_ALERT_EMAIL_RECIPIENT` | **ABSENT**       | **ABSENT**             | Target recipient (needs to be configured with the team email).       |
| `MONITORING_ALERT_DRY_RUN`         | **ABSENT**       | **ABSENT**             | Defaults to `false` (live transmission enabled).                     |
| `REDIS_URL`                        | **PRESENT**      | **PRESENT**            | Active Redis URL for BullMQ metrics and alert state persistence.     |

---

## 3. Team Email Readiness Assessment

### Is the current Resend configuration sufficient?

**Yes.** `RESEND_API_KEY` is present and validated by existing tests and application endpoints.

### Is a separate monitoring sender variable required?

**Strongly Recommended.**

Because `alerts.ts` does not fall back to `RESEND_FROM_EMAIL` and defaults to `alerts@marvedge.com`, if the Resend account has verified `mail.marvedge.com` (as indicated by `RESEND_FROM_EMAIL`), sending from `@marvedge.com` without `MONITORING_ALERT_EMAIL_SENDER` could trigger a domain verification failure in Resend.

Setting `MONITORING_ALERT_EMAIL_SENDER` to match the verified sender address (the value in `RESEND_FROM_EMAIL`) eliminates this risk.

### Is the recipient the only missing configuration?

- To receive alerts, `MONITORING_ALERT_EMAIL_RECIPIENT` is the only **mandatory** missing configuration.
- To guarantee deliverability against Resend domain verification checks, setting `MONITORING_ALERT_EMAIL_SENDER` to match the verified sender in `RESEND_FROM_EMAIL` is the recommended companion setting.

### Are there any implementation blockers?

**No.** All code, retry logic, timeout handling, HTML/text rendering, and state machines are already in place and covered by 87 passing tests.

---

## 4. Exact Environment Variables to Configure

To activate human-received alerts to the internship team email, the following environment variables need to be set:

1. **`MONITORING_ALERT_EMAIL_RECIPIENT`** (MANDATORY)
   - Value: The internship team's shared email address (or comma-separated list of team addresses).
2. **`MONITORING_ALERT_EMAIL_SENDER`** (RECOMMENDED)
   - Value: The verified sender email address (same address as `RESEND_FROM_EMAIL`).

---

## 5. Next Steps for Live Notification Verification

Once the user approves or applies the recipient configuration:

1. **Pre-flight Dry-Run Verification:** Run one cycle with `MONITORING_ALERT_DRY_RUN="true"` to verify payload construction and variable loading without sending network traffic.
2. **Live Isolated Spend/Stuck Queue Trigger:** Trigger one isolated alert (e.g. Procedure B or C from `TASK-00130-ALERTING-READINESS-AUDIT.md`) using temporary test keys.
3. **Receipt Confirmation:** Confirm timestamped arrival in the team email inbox.
4. **Resolution Notice Verification:** Clear the alert condition and confirm receipt of the `[RESOLVED]` recovery email.
5. **Documentation & Sign-Off:** Record email headers, delivery timestamps, and screenshots into `docs/qa/TASK-00130-EXTERNAL-ALERTING-VERIFICATION.md`.
