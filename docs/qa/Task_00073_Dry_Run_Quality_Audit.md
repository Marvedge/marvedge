# Task-00073: Dry-Run Quality Audit

## A. Executive summary

- Scope: audit the dry-run benchmark logic, benchmark runner, and the surrounding validation evidence for the Marvedge reframe/dubbing quality path.
- Overall status: PASS for the in-scope benchmark harness and regression gate. This status means the repository now has a verified, reproducible failure path for benchmark stages, failed benchmark jobs no longer silently produce misleading reports, and stale "success" reports are always overwritten by a real failing result.
- Verified fixes implemented:
  1. The benchmark harness writes a failed JSON result when the wrapped command fails, instead of crashing or exiting without a report.
  2. `resolve_shell_executable()` now raises `RuntimeError` explicitly when running on Windows and no POSIX shell (bash/sh) is available, instead of silently falling back to `cmd.exe`. The benchmark runner emits bash-compatible POSIX syntax; `cmd.exe` cannot parse those commands and a silent fallback would produce misleading results.
  3. Output is ASCII-safe so Windows non-UTF-8 terminals cannot abort before the JSON report is written.
  4. The runner removes stale stage output before each execution and exits immediately when a stage fails.
  5. Temp-directory cleanup in the regression tests is wrapped in `try/finally` so the directory is always removed, including when an assertion fails mid-test.
  6. A stale-report overwrite regression test confirms that a pre-existing `success: true` JSON file is always replaced with the real failing result.
  7. Isolated runner regression tests directly verify runner-level stale-output removal and fail-fast behavior using synthetic harness fixtures.
  8. Input duration validation in the harness: `args.video_sec` is validated to be a finite, non-negative number (`math.isfinite(args.video_sec)` and `>= 0`); invalid values (negative, NaN, Inf) cause an immediate non-zero exit with an informative error message without writing a report, 0 duration sets `realtime_factor: null`, and JSON serialization enforces `allow_nan=False`. Verified by 5 regression tests.
  9. Temporary-directory cleanup in `defaultUploadToCloudinary()` (`app/lib/avs/dubbingProcessor.ts`): moved directory creation and artifact download inside the `try...finally` block, ensuring temporary directories are always cleaned up even if artifact download or file writing fails (documented in `docs/qa/BUG_HUNT_LOG.md` as BUG-001 and verified by `app/lib/avs/dubbingProcessor.cleanup.test.ts`).
- Remaining risks:
  - Local Windows environment limitation: production `benchmark_runner.sh` invokes `python3`, which resolves to the Microsoft Store shim under Windows Git Bash. The runner targets Colab / Linux Cloud Run GPU environments.
  - Live AutoFlip/TalkNet and real-media validation remain blocked by unavailable model weights, service infrastructure, and external media.
  - The dry-run regression tests validate synthetic timing and serialization invariants, not end-to-end ML quality on real media.

## B. Baseline and environment

- Branch: `task/task-00073-dry-run-quality-audit`
- Starting baseline before the fix:
  - `npx vitest run scripts/benchmark/dry_run_regression.test.ts app/lib/elevenlabs/dubbing.test.ts app/lib/avs/dubbingProcessor.test.ts app/lib/reframe/service.test.ts`
  - Result: 4 test files passed, 60 tests passed.
- Validation environment:
  - OS: Windows.
  - `bash` is available in this environment (`GNU bash, version 5.3.9`), which is relevant because `benchmark_runner.sh` emits bash-compatible commands. `resolve_shell_executable()` correctly prefers `bash` in this environment.
  - Python and FFmpeg are available in the local environment, but the live ML stack and model weights are not present in this workspace.
  - Python environment note: `python` resolves to Python 3.11.0, while `python3` resolves to `C:\Users\Shambhavi\AppData\Local\Microsoft\WindowsApps\python3` (Microsoft Store stub). `python scripts/benchmark/gpu_benchmark.py --help` succeeds.
- Relevant commands executed and results:
  1. `git branch --show-current` -> repo confirmed on `task/task-00073-dry-run-quality-audit`.
  2. `git status --short` -> only the intended benchmark and audit files plus protected untracked workspace content remained.
  3. `bash --version` -> confirmed a bash shell is available on the host (`GNU bash, version 5.3.9`).
  4. Benchmark regression suite: `npx vitest run scripts/benchmark/dry_run_regression.test.ts` -> 1 test file passed, **34 tests passed** (including cue timing invariants, ASS formatting, harness failure reporting, stale-report overwrite, isolated runner control flow, and duration validation).
  5. AVS cleanup and dubbing suite: `npx vitest run app/lib/avs/dubbingProcessor.cleanup.test.ts app/lib/avs/dubbingProcessor.test.ts app/lib/elevenlabs/dubbing.test.ts` -> 3 test files passed, **28 tests passed** (verifying BUG-001 temporary-directory cleanup and dubbing contracts).
  6. Combined targeted Vitest suite: `npx vitest run scripts/benchmark/dry_run_regression.test.ts app/lib/avs/dubbingProcessor.cleanup.test.ts app/lib/avs/dubbingProcessor.test.ts app/lib/elevenlabs/dubbing.test.ts app/lib/reframe/service.test.ts` -> 5 test files passed, **70 tests passed** (or 69 tests across the 4 original files).
  7. `git diff --check` -> exit 0; no whitespace or patch-format errors.

## C. Audit findings

### Finding 00073-01: Benchmark failure reports were not reliable

- Severity: High
- Classification: Confirmed defect (fixed)
- File/path: scripts/benchmark/gpu_benchmark.py, scripts/benchmark/benchmark_runner.sh
- Reproduction evidence:
  - The benchmark harness accepted a wrapped command and then exited without writing JSON output when the command failed under the local Windows environment.
  - The root cause was a combination of host-dependent shell behavior and non-UTF-8 console output: the harness used Unicode box-drawing characters in its banner, which triggered a `UnicodeEncodeError` under a cp1252 terminal before the JSON report could be written.
- Root cause:
  - The script printed Unicode characters such as `═` and `─` even though the local console used a Windows non-UTF-8 codec.
  - Shell selection previously allowed a silent fallback to `cmd.exe`, which cannot interpret the benchmark runner's POSIX syntax.
  - This could hide failures as missing or stale reports instead of a real failed benchmark result.
- Fix:
  - Switched the banner output to ASCII-safe characters.
  - Replaced the silent `cmd.exe` fallback in `resolve_shell_executable()` with an explicit `RuntimeError` on Windows when no POSIX shell is found. The error message names the exact problem and the remedy (install Git for Windows or use WSL).
  - Ensured the harness returns a non-zero exit code on failed wrapped commands and writes the failed report before exiting.
  - The runner now deletes stale output before each stage and fails fast when a benchmark stage exits non-zero.
- Regression tests:
  - **Test 1** (`writes a failed report and exits non-zero when the wrapped command fails`): runs the real harness with a Python script that calls `sys.exit(1)`; asserts harness exits 1, report exists, `success: false`, `exit_code: 1`, and resolved shell is bash-compatible. Temp dir cleaned in `try/finally`.
  - **Test 2** (`overwrites a stale success report with the real failing result`): pre-seeds a stale `success: true` JSON file, then runs the harness with a failing command; asserts the file is overwritten with `success: false`, `exit_code: 1`, and a fresh `duration_seconds`. Temp dir cleaned in `try/finally`.
  - **Duration validation tests** (`scripts/benchmark/dry_run_regression.test.ts`): asserts rejection of `-10`, `nan`, and `inf` with non-zero exit and no JSON output; asserts acceptance of positive duration with valid JSON; asserts acceptance of zero duration reporting a null realtime factor.
- Remaining limitations:
  - This validates the benchmark-harness contract, input validation, and shell selection for the repo's runner, but it does not validate real ML output quality or long-form pipeline correctness.
  - End-to-end execution of `benchmark_runner.sh` remains impractical in this environment because it depends on external media and service prerequisites outside the repo, as well as Linux/Colab Python alias conventions.

### Finding 00073-02: Stale outputs could be mistaken for current results

- Severity: Medium
- Classification: Confirmed defect (fixed)
- File/path: scripts/benchmark/benchmark_runner.sh
- Reproduction evidence:
  - The runner previously accumulated JSON artifacts in the benchmark output directory without clearing stage results before each run.
  - If a stage failed or was skipped, prior JSON output could remain visible and look like a valid current result.
- Root cause:
  - The loop over `OUT_DIR/*.json` printed whatever files existed, without clearing stale results or stopping on a failed stage.
- Fix:
  - The runner now removes any prior output file before executing a stage (`rm -f "$OUT_DIR/${label}.json"` at line 66) and exits immediately if a stage fails (lines 67-75).
- Regression test:
  - Covered directly by Test 2 (stale-report overwrite) in the Task-00073 suite.
  - Runner-level stale-output removal and fail-fast are directly covered by isolated runner regression tests (`scripts/benchmark/dry_run_regression.test.ts`), confirming lines 66-75 of `benchmark_runner.sh` in isolation without executing the full live ML pipeline.

## D. Coverage assessment

- Dry-run logic: Covered by synthetic timing, serialization, and duration validation tests (34 tests in `scripts/benchmark/dry_run_regression.test.ts`).
- Reframe: Covered by `app/lib/reframe/service.test.ts` for service contract and behavior around reframe operations.
- Captions / ASS generation: Covered by subtitle serialization and timing invariants in the benchmark regression and subtitle unit tests.
- Dubbing: Covered by `app/lib/elevenlabs/dubbing.test.ts`, `app/lib/avs/dubbingProcessor.test.ts`, and `app/lib/avs/dubbingProcessor.cleanup.test.ts` (28 tests total).
- Benchmark harness contract: Covered by focused regression tests (harness failure, stale-report overwrite, duration bounds) in `scripts/benchmark/dry_run_regression.test.ts`.
- Video/audio synchronization: Not fully covered in this dry-run suite. The tests validate cue-time invariants and serialization, not an end-to-end time-sync run on real media.
- Output encoding: Partially covered by ASS generation tests; no live FFmpeg re-encode validation is asserted here beyond the synthetic generation path.
- benchmark_runner.sh runner-level behaviors (stale-output deletion, fail-fast): Directly covered by isolated runner regression tests in `scripts/benchmark/dry_run_regression.test.ts` (using bash and self-contained synthetic fixtures). Production `python3` executable resolution on Windows is not covered.
- Missing or blocked coverage: real ML service execution, AutoFlip/TalkNet end-to-end runs, and live-media quality validation remain external-blocked and unverified.

## E. Historical regression review

- Task-00053 findings remain relevant as historical context, but their live validation remains blocked.
- `task53-results/regression_summary.md` and `task53-results/regression_report.json` record the original block: HTTP 502s, inaccessible source paths from the ML worker perspective, missing TalkNet weights, and timeout/size constraints for long-form processing.
- Current status of the historical findings:
  - Blocked path access and missing model weights: still external-blocked; no live service evidence in this branch.
  - Long-form timeout constraints: still architectural constraints without a live ML environment to validate against.
  - TalkNet/AutoFlip fusion and center-crop fallback wiring: still unverified in this repository without the required service stack and weights.
- The current repo does not provide a new proving run that overturns the historical Task-00053 block. The audit therefore treats those findings as historical and externally blocked, not as a current in-repo regression.

## F. Validation results

### Unit tests

- Command 1 (Benchmark regression): `npx vitest run scripts/benchmark/dry_run_regression.test.ts`
  - Result: **PASS** (1 test file passed, **34 tests passed**).
- Command 2 (AVS cleanup & dubbing): `npx vitest run app/lib/avs/dubbingProcessor.cleanup.test.ts app/lib/avs/dubbingProcessor.test.ts app/lib/elevenlabs/dubbing.test.ts`
  - Result: **PASS** (3 test files passed, **28 tests passed**).
- Command 3 (Combined targeted suite): `npx vitest run scripts/benchmark/dry_run_regression.test.ts app/lib/avs/dubbingProcessor.cleanup.test.ts app/lib/avs/dubbingProcessor.test.ts app/lib/elevenlabs/dubbing.test.ts app/lib/reframe/service.test.ts`
  - Result: **PASS** (5 test files passed, **70 tests passed**).

### git diff --check

- Command: `git diff --check`
- Result: **PASS** — exit 0, no whitespace or patch errors.

### git diff --stat

```
 app/lib/avs/dubbingProcessor.ts              |  46 ++-
 scripts/benchmark/benchmark_runner.sh        |   8 +-
 scripts/benchmark/dry_run_regression.test.ts | 557 +++++++++++++++++++++++++++
 scripts/benchmark/gpu_benchmark.py           | 141 ++++++-
 4 files changed, 717 insertions(+), 35 deletions(-)
```

### Integration/benchmark validation

- Command: `npx vitest run scripts/benchmark/dry_run_regression.test.ts`
- Result: **PASS**
- Evidence: all 34 benchmark regression tests pass, including cue timing invariants (12), ASS formatting (11), harness failure-reporting (1), stale-report overwrite (1), isolated runner behavior tests (2: stale-output removal and fail-fast), and duration validation (5).
- Limitation: this is repo-level validation of the benchmark contract, input validation, and isolated runner control flow; it is not a live reframe or cloud ML validation run. Live AutoFlip/TalkNet execution and real-media quality remain unverified.

### Live-service validation

- Not attempted and not claimed as passing. Live AutoFlip/TalkNet execution remains unverified.
- Blocker: Task-00053 evidence shows missing model weights, unavailable service infrastructure, and external media dependencies.

### Real-media quality validation

- Not attempted and not claimed as passing. Real-media quality remains unverified.
- Blocker: unavailable ML stack and no representative media fixtures in the repository for end-to-end benchmark validation.

## G. Follow-up actions

- Obtain or restore the required TalkNet weights and ML gateway services before any live reframe/crop validation.
- Run the benchmark runner against a known-good, representative media corpus with the real ML stack enabled.
- If benchmark output is used in a CI or dry-run quality gate, keep the failure-reporting contract enforced by the benchmark harness to prevent silent false positives.

## H. benchmark_runner.sh runner-level behavior analysis

### Stale-output removal (line 66)

```bash
rm -f "$OUT_DIR/${label}.json"
```

This runs before `python3 "$HARNESS" …` on every stage. It ensures no prior JSON survives into a new benchmark pass. **Directly covered by isolated runner regression tests** in Vitest (`scripts/benchmark/dry_run_regression.test.ts` Suite 5b) using bash and synthetic harness fixtures, verifying that stale outputs are deleted prior to execution without requiring live media or ML services.

### Fail-fast on stage failure (lines 67-75)

```bash
if ! python3 "$HARNESS" \
    --stage "$stage" \
    --cmd   "$cmd" \
    --out   "$OUT_DIR/${label}.json" \
    --gpu-type "$GPU_TYPE" \
    --video-sec "$dur"; then
    echo "[ERROR] ${stage} benchmark failed for ${label} (${clip})" >&2
    exit 1
fi
```

The `if ! …; then exit 1; fi` guard ensures the runner halts immediately when the harness exits non-zero. Combined with stale-output removal, a failed stage cannot be followed by a result-summary that reads a stale successful report. **Directly covered by isolated runner regression tests** in Vitest (`scripts/benchmark/dry_run_regression.test.ts` Suite 5b), verifying that runner execution exits non-zero and halts subsequent stages on failure. Note that while runner control flow is directly verified in isolation, the full live ML pipeline was not tested.

### Python portability and execution context analysis (lines 67, 89, 113-118)

The production `benchmark_runner.sh` script invokes `python3` directly:

- Line 67: `python3 "$HARNESS" ...`
- Line 89: `"python3 $PREPROCESS_SCRIPT ..."`
- Lines 113-118: `python3 -c "import json...; ..."` for JSON report collation.

**Local Windows environment limitation:**
In the tested Windows Git Bash environment:

- `python` resolves to Python 3.11.0 (`python scripts/benchmark/gpu_benchmark.py --help` succeeds).
- `python3` resolves to `C:\Users\Shambhavi\AppData\Local\Microsoft\WindowsApps\python3`, which triggers the Microsoft Store installation stub message instead of running Python.
- As documented in the script header (`# Run this from the repo root after cloning on a Colab / Cloud Run GPU instance`), the production runner is designed for Colab and Linux Cloud Run GPU environments where `python3` is the standard Python interpreter.
- Production code was intentionally not modified solely to accommodate this local Windows alias issue, preserving alignment with the intended Linux/Colab deployment target.

**Test isolation and coverage boundaries:**

- The isolated runner regression tests in Vitest (`scripts/benchmark/dry_run_regression.test.ts` Suite 5b) use `findPython()` to discover the working Python executable (`python`) and inject it into mini-runners reproducing lines 66–75.
- **Verified:** Runner control flow — specifically stale-output removal (`rm -f`) and fail-fast termination (`if ! ...; then exit 1; fi`) — is directly verified in isolation.
- **Not verified by runner tests:** The production runner's hardcoded `python3` executable resolution on Windows hosts is not verified by Vitest (and is known to fail under the local WindowsApps `python3` alias).
- **Unverified live pipeline:** Full live AutoFlip, TalkNet, and end-to-end GPU media benchmarking remain unverified due to external infrastructure, model weight, and media prerequisites.

## I. Final outcome

This task is complete for the in-scope benchmark harness, runner control flow, and regression integrity paths:

1. **Verified regression behavior:**
   - The benchmark harness writes a structured failed JSON report and exits non-zero on command failure, rather than crashing or exiting without an artifact.
   - `resolve_shell_executable()` raises `RuntimeError` explicitly on Windows when no POSIX shell (bash/sh) is available, preventing silent `cmd.exe` syntax errors.
   - Stale `success: true` JSON reports are reliably overwritten with actual failing results.
   - Duration validation strictly rejects negative values, NaN, and Inf, sets `realtime_factor: null` on 0 duration, and serializes safely with `allow_nan=False` (5/5 tests pass).
   - `benchmark_runner.sh` runner-level behaviors (stale-output removal before stage run and fail-fast termination on failure) are directly covered by isolated runner tests in Vitest.
   - `defaultUploadToCloudinary()` (`app/lib/avs/dubbingProcessor.ts`) cleans up its temporary directory on download or write failure inside `try...finally` (BUG-001, 1/1 test pass).
   - Test suites pass cleanly:
     - `scripts/benchmark/dry_run_regression.test.ts`: 34 passed (34).
     - `app/lib/avs/dubbingProcessor.cleanup.test.ts`, `dubbingProcessor.test.ts`, `elevenlabs/dubbing.test.ts`: 28 passed (28).
     - Combined targeted suite (including `reframe/service.test.ts`): 70 passed (70) across 5 test files.
   - `git diff --check` exits 0 with no whitespace errors.

2. **Local Windows environment limitation:**
   - Production `benchmark_runner.sh` hardcodes `python3`, which resolves to a Microsoft Store stub in Windows Git Bash (`python` resolves to Python 3.11.0). The runner is designed for Colab / Linux Cloud Run GPU environments. Isolated runner tests inject discovered Python into mini-runners; they do not test production `python3` alias resolution on Windows.

3. **Unverified end-to-end GPU/media pipeline behavior:**
   - Live AutoFlip/TalkNet model execution, Cloud Run GPU integration, and real-media benchmark quality remain unverified and blocked by external dependencies (unavailable model weights and service infrastructure).
