param(
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend"
$backend = Join-Path $root "backend"
$logOut = Join-Path $PSScriptRoot "local-preview-out.log"
$logErr = Join-Path $PSScriptRoot "local-preview-err.log"
$url = "http://127.0.0.1:8080/"

function Test-Axiom {
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/health" -TimeoutSec 2
    return $response.status -eq "ok"
  } catch {
    return $false
  }
}

if (Test-Axiom) {
  Write-Host "Axiom is already running at $url"
  exit 0
}

$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) {
  Write-Host "Python was not found. Install Python 3.12 first."
  exit 1
}

$occupied = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($occupied) {
  Write-Host "Port 8080 is already used by another program (PID $($occupied.OwningProcess))."
  Write-Host "Close it, then run this launcher again."
  exit 1
}

$dist = Join-Path $frontend "dist-online\index.html"
if ($Rebuild -or -not (Test-Path -LiteralPath $dist)) {
  Write-Host "Building the frontend (first run may take a minute)..."
  Push-Location $frontend
  try {
    cmd /c "npm.cmd run build:online"
    if ($LASTEXITCODE -ne 0) {
      throw "Frontend build failed."
    }
  } finally {
    Pop-Location
  }
}

Write-Host "Starting Axiom local server..."
$process = Start-Process -FilePath $python `
  -ArgumentList @("online_server.py") `
  -WorkingDirectory $backend `
  -WindowStyle Hidden `
  -RedirectStandardOutput $logOut `
  -RedirectStandardError $logErr `
  -PassThru

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 750
  if (Test-Axiom) {
    $ready = $true
    break
  }
  if ($process.HasExited) {
    break
  }
}

if (-not $ready) {
  Write-Host "Axiom did not start. Check these logs:"
  Write-Host "  $logOut"
  Write-Host "  $logErr"
  exit 1
}

Write-Host ""
Write-Host "Axiom is ready: $url"
Write-Host "Demo login: demo@axiom.local / axiom-demo-2026"
Write-Host "Close this window; the server keeps running in the background."
Write-Host "To stop it later, double-click 停止本地预览.cmd."
