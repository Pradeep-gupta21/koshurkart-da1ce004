$ErrorActionPreference = 'Continue'
$ErrorView = 'NormalView'

# ============================================================================
# Configuration
# ============================================================================

$dbContainer = 'supabase_db_xlqzbomiuuadxcygnsal'

$sessionAHoldSeconds = 15
$readinessTimeoutSeconds = 8
$sessionBStatementTimeoutSeconds = 3
$pollIntervalMilliseconds = 500

$readinessMaxRetries = [Math]::Ceiling(
    ($readinessTimeoutSeconds * 1000) / $pollIntervalMilliseconds
)

# Unique Session-A identity prevents this invocation from observing or
# terminating a Session-A backend belonging to another concurrent test run.
$sessionAApplicationName = "concurrency_session_a_$([guid]::NewGuid().ToString('N'))"

# The advisory lock is only a readiness marker. Use invocation-specific
# positive int32 values so parallel test runs cannot contend on the same marker.
$readinessLockClassId = Get-Random -Minimum 1 -Maximum 2147483647
$readinessLockObjectId = Get-Random -Minimum 1 -Maximum 2147483647

# Explicit initialization guarantees that finally can safely execute even if
# setup fails before the background job is created.
$job = $null

try {
    # =========================================================================
    # 1. Prepare deterministic fixture
    # =========================================================================

    $setupFile = Join-Path $PSScriptRoot 'supabase\tests\concurrency_setup.sql'

    if (-not (Test-Path -LiteralPath $setupFile)) {
        throw "Setup file missing at $setupFile"
    }

    $cpOutput = docker cp `
        $setupFile `
        "${dbContainer}:/tmp/setup.sql" 2>&1

    if ($LASTEXITCODE -ne 0) {
        throw "docker cp failed: $cpOutput"
    }

    $setupOutput = docker exec `
        $dbContainer `
        psql `
        -v ON_ERROR_STOP=1 `
        -U postgres `
        -d postgres `
        -f /tmp/setup.sql 2>&1

    if ($LASTEXITCODE -ne 0) {
        throw "setup.sql execution failed: $setupOutput"
    }

    # =========================================================================
    # 2. Start Session A
    #
    # Ordering is intentional:
    #
    #   BEGIN
    #   -> SELECT target order FOR UPDATE
    #   -> acquire advisory readiness marker
    #   -> hold transaction open
    #   -> COMMIT
    #
    # The advisory lock is only a readiness marker. It is acquired after
    # SELECT ... FOR UPDATE completes and therefore proves Session A crossed
    # the row-lock acquisition statement.
    # =========================================================================

    $job = Start-Job `
        -ArgumentList `
        $dbContainer, `
        $sessionAHoldSeconds, `
        $sessionAApplicationName, `
        $readinessLockClassId, `
        $readinessLockObjectId {
        param(
            $container,
            $holdSeconds,
            $applicationName,
            $lockClassId,
            $lockObjectId
        )

        $sessionASql = @"
BEGIN;
SELECT *
FROM public.orders
WHERE id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
FOR UPDATE;
SELECT pg_advisory_xact_lock($lockClassId, $lockObjectId);
SELECT pg_sleep($holdSeconds);
COMMIT;
"@

        $out = docker exec `
            -e "PGAPPNAME=$applicationName" `
            $container `
            psql `
            -v ON_ERROR_STOP=1 `
            -U postgres `
            -d postgres `
            -c $sessionASql 2>&1

        if ($LASTEXITCODE -ne 0) {
            throw "Session A failed: $out"
        }
    }

    # =========================================================================
    # 3. Wait for Session A readiness
    # =========================================================================

    $locked = $false

    for ($i = 0; $i -le $readinessMaxRetries; $i++) {
        if ($job.State -eq 'Failed' -or $job.State -eq 'Completed') {
            break
        }

        $readinessSql = @"
SELECT COUNT(*)
FROM pg_locks l
JOIN pg_stat_activity a
  ON l.pid = a.pid
WHERE a.application_name = '$sessionAApplicationName'
  AND l.locktype = 'advisory'
  AND l.classid = $readinessLockClassId
  AND l.objid = $readinessLockObjectId
  AND l.granted = true;
"@

        # Keep stdout clean because this result must parse as a single integer.
        # stderr is intentionally not merged into $locksRaw.
        $locksRaw = docker exec `
            $dbContainer `
            psql `
            -tA `
            -v ON_ERROR_STOP=1 `
            -U postgres `
            -d postgres `
            -c $readinessSql

        if ($LASTEXITCODE -ne 0) {
            throw 'Session A readiness probe failed.'
        }

        $locks = 0
        $locksText = ($locksRaw | Out-String).Trim()

        if (-not [int]::TryParse($locksText, [ref]$locks)) {
            throw "Session A readiness probe returned invalid output: '$locksText'"
        }

        if ($locks -gt 0) {
            $locked = $true
            break
        }

        # Do not sleep after the final permitted probe.
        if ($i -lt $readinessMaxRetries) {
            Start-Sleep -Milliseconds $pollIntervalMilliseconds
        }
    }

    if (-not $locked) {
        if ($job.State -eq 'Failed' -or $job.State -eq 'Completed') {
            $jobResult = Receive-Job -Job $job 2>&1
            throw "Session A exited early: $jobResult"
        }

        throw "Session A failed to acquire lock within the configured readiness window"
    }

    # =========================================================================
    # 4. Run Session B
    #
    # Session B attempts to insert a ledger entry referencing the order whose
    # parent row is held FOR UPDATE by Session A.
    #
    # The expected result is statement_timeout while PostgreSQL waits on the
    # FK-related parent-row lock conflict.
    # =========================================================================

    $opKey = [guid]::NewGuid().ToString()

    $sessionBOutput = docker exec `
        $dbContainer `
        psql `
        -v ON_ERROR_STOP=1 `
        -U postgres `
        -d postgres `
        -c "BEGIN; SET statement_timeout = '${sessionBStatementTimeoutSeconds}s'; INSERT INTO public.ledger_entries (vendor_id, order_id, type, status, amount_paise, operation_key) VALUES ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'credit', 'pending', 100, '$opKey'); COMMIT;" 2>&1

    $bExit = $LASTEXITCODE

    # =========================================================================
    # 5. Verify Session B failed for the expected reason
    # =========================================================================

    if ($bExit -eq 0) {
        throw 'Session B succeeded! Test failed (concurrency invariant broken).'
    }

    if (
        $sessionBOutput -match 'statement timeout' -or
        $sessionBOutput -match 'canceling statement due to statement timeout'
    ) {
        Write-Host 'PASS: Session B failed with expected timeout.'
    }
    else {
        throw "Session B failed for unexpected reason: $sessionBOutput"
    }

    # =========================================================================
    # 6. Verify Session A completed successfully
    # =========================================================================

    $waitResult = Wait-Job `
        -Job $job `
        -Timeout ($sessionAHoldSeconds + 5)

    if ($null -eq $waitResult) {
        throw 'Session A did not complete within the expected timeout.'
    }

    $jobResult = Receive-Job -Job $job 2>&1

    if (
        $job.State -ne 'Completed' -or
        $jobResult -match 'Exception' -or
        $jobResult -match 'Error'
    ) {
        throw "Session A failed: $jobResult"
    }

    Write-Host 'PASS: Session A completed successfully.'
    Write-Host 'PASS: Concurrency invariant verified.'
}
catch {
    Write-Error $_
    exit 1
}
finally {
    # =========================================================================
    # 7. Deterministic cleanup
    #
    # Stop-Job alone cannot guarantee termination of a synchronous native
    # docker exec/psql process. If Session A is still running, terminate the
    # uniquely identified PostgreSQL backend first so its transaction and
    # locks are released at the database boundary.
    # =========================================================================

    if ($null -ne $job) {
        if ($job.State -eq 'Running') {
            $terminateSql = @"
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE application_name = '$sessionAApplicationName'
  AND pid <> pg_backend_pid();
"@

            $terminateOutput = docker exec `
                $dbContainer `
                psql `
                -v ON_ERROR_STOP=1 `
                -U postgres `
                -d postgres `
                -c $terminateSql 2>&1

            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Failed to terminate Session A database backend: $terminateOutput"
            }

            Stop-Job `
                -Job $job `
                -ErrorAction SilentlyContinue | Out-Null
        }

        Remove-Job `
            -Job $job `
            -Force `
            -ErrorAction SilentlyContinue | Out-Null
    }
}