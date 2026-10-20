<#
.SYNOPSIS
    Session-specific EC2 GPU Watchdog for safe Marvedge validation runs.

.DESCRIPTION
    Enforces the approved session limits:
    - Maximum 3 hours per session (default watchdog timer set to 175 minutes / 2h 55m)
    - Approximately $10 per session (~$0.526/hr for g4dn.xlarge in ap-southeast-2)
    - $50 overall approved testing ceiling

    Records session start time, monitors elapsed session duration, triggers an
    authenticated EC2 stop request before the 3-hour deadline, and verifies the final stopped state.

.NOTES
    CRITICAL SAFETY NOTICE:
    This watchdog script runs locally on the operator's workstation.
    It depends on the workstation remaining awake, running, and internet-connected,
    and on AWS CLI session credentials remaining valid for the duration of the test.
    It is NOT an independently guaranteed cloud-side safeguard (such as a CloudWatch
    Alarm with an EC2 Stop Action).
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$InstanceId = "i-02aa4578f3790bae1",

    [Parameter()]
    [string]$Region = "ap-southeast-2",

    [Parameter()]
    [string]$Profile = "marvedge",

    [Parameter()]
    [int]$MaxDurationMinutes = 175,

    [Parameter()]
    [int]$CheckIntervalSeconds = 30,

    [Parameter()]
    [switch]$DryRun,

    [Parameter()]
    [switch]$StopNow
)

$ErrorActionPreference = "Continue"

function Write-Banner {
    Write-Host "=============================================================================" -ForegroundColor Cyan
    Write-Host " MARVEDGE GPU SESSION WATCHDOG (Task-00094)" -ForegroundColor Cyan
    Write-Host "=============================================================================" -ForegroundColor Cyan
    Write-Host " Instance ID:        $InstanceId"
    Write-Host " AWS Region:         $Region"
    Write-Host " AWS Profile:        $Profile"
    Write-Host " Max Session Limit:  $MaxDurationMinutes minutes ($([Math]::Round($MaxDurationMinutes / 60, 2)) hours)"
    Write-Host " Cost Guardrail:     ~`$10 / session approved limit, `$50 overall budget ceiling"
    Write-Host "-----------------------------------------------------------------------------"
    Write-Host "[!] SAFETY NOTICE:" -ForegroundColor Yellow
    Write-Host "    This watchdog runs locally on this workstation. It requires the machine"
    Write-Host "    to remain awake, connected to the network, and AWS credentials to remain"
    Write-Host "    valid. It is NOT an independently guaranteed cloud-side safeguard."
    Write-Host "=============================================================================" -ForegroundColor Cyan
}

function Test-StopAuthorization {
    Write-Host "[watchdog] Verifying EC2 stop permission via dry run..." -ForegroundColor Cyan
    $output = aws ec2 stop-instances --instance-ids $InstanceId --region $Region --profile $Profile --dry-run 2>&1
    $outputStr = $output -join " "
    if ($outputStr -match "DryRunOperation" -or $outputStr -match "Request would have succeeded") {
        Write-Host "[watchdog] PASS: EC2 stop-instances permission verified successfully (DryRun passed)." -ForegroundColor Green
        return $true
    } else {
        Write-Host "[watchdog] FAIL: Dry run failed to verify stop-instances authorization." -ForegroundColor Red
        Write-Host $outputStr -ForegroundColor Red
        return $false
    }
}

function Get-InstanceState {
    $state = aws ec2 describe-instances --instance-ids $InstanceId --region $Region --profile $Profile `
        --query "Reservations[0].Instances[0].State.Name" --output text 2>&1
    return ($state -as [string]).Trim()
}

function Invoke-StopInstance {
    Write-Host "[watchdog] Issuing EC2 stop request for $InstanceId..." -ForegroundColor Yellow
    $stopOutput = aws ec2 stop-instances --instance-ids $InstanceId --region $Region --profile $Profile 2>&1
    Write-Host ($stopOutput -join "`n")

    Write-Host "[watchdog] Waiting for instance to transition to 'stopped'..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddMinutes(5)
    do {
        Start-Sleep -Seconds 10
        $currentState = Get-InstanceState
        Write-Host "[watchdog] Current instance state: $currentState"
        if ($currentState -eq "stopped") {
            Write-Host "[watchdog] SUCCESS: Instance $InstanceId is confirmed STOPPED." -ForegroundColor Green
            return $true
        }
    } while ((Get-Date) -lt $deadline)

    Write-Host "[watchdog] WARNING: Timed out waiting for stopped confirmation. Final state: $currentState" -ForegroundColor Red
    return ($currentState -eq "stopped")
}

Write-Banner

# Always test authorization first
$authOk = Test-StopAuthorization
if (-not $authOk) {
    Write-Host "[watchdog] ABORTING: Cannot verify EC2 stop permission. Aborting watchdog." -ForegroundColor Red
    exit 1
}

if ($DryRun) {
    Write-Host "[watchdog] Dry run verification complete. Exiting without changing instance state." -ForegroundColor Green
    exit 0
}

if ($StopNow) {
    Write-Host "[watchdog] Immediate stop requested." -ForegroundColor Yellow
    $stopped = Invoke-StopInstance
    exit $(if ($stopped) { 0 } else { 1 })
}

# Normal monitoring loop
$initialState = Get-InstanceState
Write-Host "[watchdog] Initial instance state: $initialState"

if ($initialState -eq "stopped") {
    Write-Host "[watchdog] Note: Instance is currently stopped. If you start a validation session, this watchdog will guard it." -ForegroundColor Yellow
}

$startTime = Get-Date
$endTime = $startTime.AddMinutes($MaxDurationMinutes)
Write-Host "[watchdog] Session timer started at: $($startTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Green
Write-Host "[watchdog] Hard deadline:            $($endTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Yellow

try {
    while ((Get-Date) -lt $endTime) {
        $elapsed = (Get-Date) - $startTime
        $remaining = $endTime - (Get-Date)
        $currentState = Get-InstanceState

        Write-Host "[watchdog] Elapsed: $($elapsed.ToString('hh\:mm\:ss')) | Remaining: $($remaining.ToString('hh\:mm\:ss')) | Instance state: $currentState"

        if ($currentState -eq "stopped" -and $elapsed.TotalMinutes -gt 1) {
            Write-Host "[watchdog] Instance stopped externally. Validation session ended cleanly." -ForegroundColor Green
            exit 0
        }

        Start-Sleep -Seconds $CheckIntervalSeconds
    }

    Write-Host "[watchdog] DEADLINE REACHED ($MaxDurationMinutes minutes). Stopping GPU instance to prevent overruns..." -ForegroundColor Red
    $stopped = Invoke-StopInstance
    exit $(if ($stopped) { 0 } else { 1 })
} finally {
    # If interrupted by user, ensure safety notice
    $finalCheck = Get-InstanceState
    Write-Host "`n[watchdog] Watchdog session ended. Current instance state: $finalCheck" -ForegroundColor Cyan
}
