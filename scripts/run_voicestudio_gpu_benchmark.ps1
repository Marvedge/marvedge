<#
.SYNOPSIS
    Fail-Safe Local Orchestrator for VoiceStudio GPU Benchmark (Task-00103).

.DESCRIPTION
    Executes the approved GPU validation workflow with strict guardrails:
    - Verifies EC2 stop permissions (DryRun) prior to startup.
    - Arms a local 35-minute runtime ceiling timer.
    - Supports Topology A (Native EC2 execution) and Topology B (Local tunnel execution).
    - Ensures fail-safe guaranteed instance teardown on success, failure, or interruption.
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
    [ValidateSet("TopologyA", "TopologyB")]
    [string]$Topology = "TopologyA",

    [Parameter()]
    [string]$SshKeyPath = "~/.ssh/marvedge-worker.pem",

    [Parameter()]
    [int]$HardCeilingMinutes = 35
)

$ErrorActionPreference = "Stop"

function Write-Banner {
    Write-Host "=============================================================================" -ForegroundColor Cyan
    Write-Host " MARVEDGE TASK-00103: VOICESTUDIO GPU BENCHMARK ORCHESTRATOR" -ForegroundColor Cyan
    Write-Host "=============================================================================" -ForegroundColor Cyan
    Write-Host " Instance ID:        $InstanceId"
    Write-Host " Region:             $Region"
    Write-Host " Profile:            $Profile"
    Write-Host " Execution Mode:     $Topology"
    Write-Host " Hard Timeout:       $HardCeilingMinutes minutes ($0.533 USD compute ceiling)"
    Write-Host "=============================================================================" -ForegroundColor Cyan
}

function Test-StopPermission {
    Write-Host "[orchestrator] Verifying EC2 stop permission via dry run..." -ForegroundColor Cyan
    $output = aws ec2 stop-instances --instance-ids $InstanceId --region $Region --profile $Profile --dry-run 2>&1
    $outputStr = $output -join " "
    if ($outputStr -match "DryRunOperation" -or $outputStr -match "Request would have succeeded") {
        Write-Host "[orchestrator] PASS: EC2 stop permission confirmed (DryRun passed)." -ForegroundColor Green
        return $true
    } else {
        Write-Host "[orchestrator] FATAL: Cannot verify EC2 stop permission: $outputStr" -ForegroundColor Red
        return $false
    }
}

function Invoke-GuaranteedTeardown {
    Write-Host "`n[teardown] Initiating guaranteed EC2 instance stop sequence..." -ForegroundColor Yellow
    $retries = 5
    $delay = 2
    $stopped = $false

    for ($i = 1; $i -le $retries; $i++) {
        try {
            Write-Host "[teardown] Issuing aws ec2 stop-instances (attempt $i/$retries)..."
            aws ec2 stop-instances --instance-ids $InstanceId --region $Region --profile $Profile | Out-Null
            $stopped = $true
            break
        } catch {
            Write-Host "[teardown] Warning: stop-instances call failed ($($_.Exception.Message)). Retrying in ${delay}s..." -ForegroundColor Red
            Start-Sleep -Seconds $delay
            $delay = $delay * 2
        }
    }

    Write-Host "[teardown] Verifying instance transitions to 'stopped'..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddMinutes(5)
    do {
        Start-Sleep -Seconds 10
        $state = (aws ec2 describe-instances --instance-ids $InstanceId --region $Region --profile $Profile --query "Reservations[0].Instances[0].State.Name" --output text 2>&1) -as [string]
        $state = $state.Trim()
        Write-Host "[teardown] Current instance state: $state"
        if ($state -eq "stopped") {
            Write-Host "[teardown] SUCCESS: Instance $InstanceId is confirmed STOPPED." -ForegroundColor Green
            return
        }
    } while ((Get-Date) -lt $deadline)

    if ($state -ne "stopped") {
        Write-Host "[teardown] CRITICAL ALERT: Instance did not confirm stopped within 5 minutes." -ForegroundColor Red
        Write-Host "[teardown] Please check AWS console immediately:" -ForegroundColor Red
        Write-Host "https://$Region.console.aws.amazon.com/ec2/home?region=$Region#InstanceDetails:instanceId=$InstanceId" -ForegroundColor Yellow
    }
}

Write-Banner

# 1. Mandatory Preflight: Test Stop Permission
if (-not (Test-StopPermission)) {
    throw "Aborting: Missing EC2 stop authorization."
}

$startTime = Get-Date
$deadline = $startTime.AddMinutes($HardCeilingMinutes)
Write-Host "[orchestrator] Execution clock started at: $($startTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Green
Write-Host "[orchestrator] Mandatory teardown deadline: $($deadline.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Yellow

try {
    # 2. Start EC2 Instance
    Write-Host "[orchestrator] Starting EC2 instance $InstanceId..." -ForegroundColor Cyan
    aws ec2 start-instances --instance-ids $InstanceId --region $Region --profile $Profile | Out-Null

    Write-Host "[orchestrator] Waiting for instance to report 'running'..." -ForegroundColor Cyan
    aws ec2 wait instance-running --instance-ids $InstanceId --region $Region --profile $Profile

    $ip = (aws ec2 describe-instances --instance-ids $InstanceId --region $Region --profile $Profile --query "Reservations[0].Instances[0].PublicIpAddress" --output text).Trim()
    Write-Host "[orchestrator] Instance running at Public IP: $ip" -ForegroundColor Green

    # 3. Mode Execution
    if ($Topology -eq "TopologyA") {
        Write-Host "[orchestrator] Running Topology A (Remote execution on EC2 host)..." -ForegroundColor Cyan
        Write-Host "[orchestrator] Connecting via SSH to execute /opt/marvedge/scripts/benchmark/run_voicestudio_host.sh..."
        ssh -o StrictHostKeyChecking=no -i $SshKeyPath ec2-user@$ip "bash /opt/marvedge/scripts/benchmark/run_voicestudio_host.sh"

        Write-Host "[orchestrator] Retrieving benchmark results..."
        mkdir -p benchmark_results
        scp -i $SshKeyPath "ec2-user@${ip}:/opt/marvedge/benchmark_results/*" ./benchmark_results/
    } else {
        Write-Host "[orchestrator] Running Topology B (Local tunnel execution)..." -ForegroundColor Cyan
        Write-Host "[orchestrator] Starting port forwarding tunnel (127.0.0.1:3900)..."
        $tunnelProcess = Start-Process -FilePath "ssh" -ArgumentList "-N -L 3900:127.0.0.1:3900 -i $SshKeyPath -o StrictHostKeyChecking=no ec2-user@$ip" -PassThru

        try {
            Write-Host "[orchestrator] Verifying readiness via tunnel probe..."
            python scripts/check_voicestudio_readiness.py

            Write-Host "[orchestrator] Running local benchmark suite against 127.0.0.1:3900..."
            npx tsx scripts/benchmark/cloudCostBenchmark.ts `
              --stages=dubbing `
              --provider-dubbing=voicestudio `
              --gpu=T4 `
              --hourly-rate=0.7104 `
              --concurrency=1 `
              --iterations=5 `
              --warmup=2 `
              --voicestudio-url=http://127.0.0.1:3900 `
              --output-json=benchmark_results/voicestudio_gpu_benchmark.json `
              --output-markdown=benchmark_results/voicestudio_gpu_benchmark.md
        } finally {
            if ($tunnelProcess -and -not $tunnelProcess.HasExited) {
                Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue
                Write-Host "[orchestrator] Port-forwarding tunnel terminated."
            }
        }
    }

    Write-Host "[orchestrator] Benchmark run completed successfully." -ForegroundColor Green
} catch {
    Write-Host "[orchestrator] ERROR OCCURRED: $($_.Exception.Message)" -ForegroundColor Red
    throw
} finally {
    Invoke-GuaranteedTeardown
    $elapsed = (Get-Date) - $startTime
    Write-Host "[orchestrator] Total session wall-clock: $($elapsed.ToString('hh\:mm\:ss'))" -ForegroundColor Cyan
}
