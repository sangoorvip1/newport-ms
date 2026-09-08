<#
  Newport - Windows dev bootstrap (tested syntax for PowerShell 5.1 and 7).

  All messages are ASCII on purpose: PowerShell 5.1 reads .ps1 as ANSI unless a BOM is present,
  so Arabic strings inside the script would render as mojibake on a fresh clone. The Arabic
  runbook is RUN.md (UTF-8 markdown, renders correctly).

  Usage (from a PowerShell window inside the clone):
    cd C:\src\newport-ms
    .\scripts\dev.ps1                    install + build + embedded DB + migrate + seed
    .\scripts\dev.ps1 -RunApi            the above, then keep the API running in this window
    .\scripts\dev.ps1 -RunDesktop        the above, then keep the desktop renderer running here
    .\scripts\dev.ps1 -LocalDb           use an already installed PostgreSQL (needs $env:DATABASE_URL)
    .\scripts\dev.ps1 -SkipInstall       skip "npm install" (rerun the remaining steps)

  If script execution is blocked:  powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1

  Needs: Node 20+ (22 LTS recommended), npm 10+.
#>
[CmdletBinding()]
param(
  [switch]$RunApi,
  [switch]$RunDesktop,
  [switch]$LocalDb,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$RepoRoot = Split-Path -Parent $PSScriptRoot
$DbPort = 54329
$ApiPort = 3000
$DesktopPort = 5173

function Write-Step([string]$Message) { Write-Host ("==> " + $Message) -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host ("    " + $Message) -ForegroundColor DarkGreen }

function Invoke-Native([string]$Name, [string[]]$Arguments) {
  Write-Host ("    " + $Name + " " + ($Arguments -join ' ')) -ForegroundColor DarkGray
  & $Name @Arguments
  if ($LASTEXITCODE -ne 0) { throw ("step failed: " + $Name + " " + ($Arguments -join ' ') + " (exit " + $LASTEXITCODE + ")") }
}

# A loopback connect fails instantly on a closed port, which is all we need here.
# BeginConnect/WaitOne is deliberately avoided: its shape differs between .NET Framework and
# .NET Core, and a probe that always answers "closed" would spawn a second database and then
# stall in the readiness loop.
function Test-PortOpen([string]$Computer, [int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $client.Connect($Computer, $Port)
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# --- 0) toolchain and location -------------------------------------------------------
if (-not (Test-Path (Join-Path $RepoRoot 'package.json'))) {
  throw ("package.json not found above " + $PSScriptRoot + " - run this script from inside the cloned repo")
}
Set-Location $RepoRoot
Write-Step ("checking toolchain in " + $RepoRoot)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found on PATH - install Node.js 20+ first" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm not found on PATH - it ships with Node.js" }
$nodeLine = (& node -v) | Select-Object -First 1
$nodeMajor = [int](("" + $nodeLine).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { throw ("Node " + $nodeMajor + " is too old - this project targets Node 20+ (verified on 20 and 22)") }
Write-Ok ("node " + $nodeLine + " / npm " + ((& npm -v) | Select-Object -First 1))

# --- 1) install + shared contracts package -------------------------------------------
if (-not $SkipInstall) {
  Write-Step "npm install (workspaces)"
  Invoke-Native 'npm' @('install')
}
Write-Step "build @newport/domain (clients typecheck against its dist)"
Invoke-Native 'npm' @('run', 'build', '-w', '@newport/domain')

# --- 2) database ---------------------------------------------------------------------
if ($LocalDb) {
  if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw "-LocalDb requires `$env:DATABASE_URL to be set first" }
  Write-Ok ("using your own PostgreSQL: " + $env:DATABASE_URL)
} else {
  if (Test-PortOpen '127.0.0.1' $DbPort) {
    Write-Ok ("embedded PostgreSQL already listening on " + $DbPort + " - reusing it")
  } else {
    Write-Step ("starting embedded PostgreSQL on 127.0.0.1:" + $DbPort + " (separate window; close it to stop the DB)")
    $apiDir = Join-Path $RepoRoot 'apps\api'
    if (-not (Test-Path $apiDir)) { $apiDir = Join-Path $RepoRoot 'apps/api' }
    $devDb = Join-Path $apiDir 'scripts/dev-db.mjs'
    if (-not (Test-Path $devDb)) { throw ("dev-db script not found: " + $devDb) }
    # Absolute path on purpose: relative + WorkingDirectory produced apps/api/apps/api/... on the first run.
    $dbProcess = Start-Process -FilePath 'node' -ArgumentList ('"' + $devDb + '"') -WorkingDirectory $apiDir -PassThru
    $tries = 0
    while (-not (Test-PortOpen '127.0.0.1' $DbPort)) {
      $tries = $tries + 1
      if ($dbProcess.HasExited) {
        throw ("dev-db.mjs exited with code " + $dbProcess.ExitCode + " before opening port " + $DbPort + " - read its window (first run also runs initdb)")
      }
      if ($tries -gt 120) { throw ("database did not open port " + $DbPort + " within ~120s - read the dev-db window; the very first run also runs initdb") }
      Start-Sleep -Seconds 1
    }
    Write-Ok ("database ready in " + $tries + "s (window pid " + $dbProcess.Id + ")")
  }
  $env:DATABASE_URL = "postgresql://newport:newport@127.0.0.1:" + $DbPort + "/newport?schema=public"
}

# --- 3) schema + seed ----------------------------------------------------------------
Write-Step "prisma generate + migrate deploy"
Push-Location (Join-Path $RepoRoot 'apps\api')
try {
  Invoke-Native 'npx' @('prisma', 'generate')
  Invoke-Native 'npx' @('prisma', 'migrate', 'deploy')
} finally { Pop-Location }

Write-Step "seed (departments / sections / roles / permissions / demo users)"
$env:SEED_DEMO = 'true'
Invoke-Native 'npm' @('run', 'seed', '-w', '@newport/api')

# --- 4) what to run next --------------------------------------------------------------
Write-Step "ready"
Write-Host ""
Write-Host "  Reuse THIS window - it holds `$env:DATABASE_URL:" -ForegroundColor Yellow
Write-Host "    `$env:SITE_TZ = 'Asia/Baghdad'; `$env:STORAGE_DRIVER = 'local'; `$env:STORAGE_LOCAL_DIR = 'storage/documents'"
Write-Host ("    npm run start:dev -w '@newport/api'        # API on http://localhost:" + $ApiPort + "/api")
Write-Host ("    npm run dev -w '@newport/desktop'          # desktop UI on http://localhost:" + $DesktopPort)
Write-Host ""
Write-Host "  Smoke test with both up (needs the API only):" -ForegroundColor Yellow
Write-Host ("    `$env:API_URL = 'http://127.0.0.1:" + $ApiPort + "/api'; node apps/api/scripts/e2e-smoke.mjs")
Write-Host ""

if ($RunApi) {
  $env:SITE_TZ = 'Asia/Baghdad'
  $env:STORAGE_DRIVER = 'local'
  $env:STORAGE_LOCAL_DIR = 'storage/documents'
  Write-Step "starting API in this window (Ctrl-C to stop)"
  Invoke-Native 'npm' @('run', 'start:dev', '-w', '@newport/api')
} elseif ($RunDesktop) {
  Write-Step "starting desktop renderer in this window (Ctrl-C to stop)"
  Invoke-Native 'npm' @('run', 'dev', '-w', '@newport/desktop')
}
