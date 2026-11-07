$ErrorActionPreference = "Stop"
$conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $conn) {
  Write-Host "Axiom is not running on port 8080."
  exit 0
}

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/health" -TimeoutSec 2
} catch {
  $health = $null
}
if (-not $health -or $health.status -ne "ok") {
  Write-Host "Port 8080 is not a healthy Axiom server; nothing was stopped."
  exit 1
}

$process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
if (-not $process -or $process.ProcessName -notmatch "python") {
  Write-Host "Port 8080 is used by a non-Python program; nothing was stopped."
  exit 1
}

Stop-Process -Id $conn.OwningProcess -Force
Write-Host "Axiom local preview stopped."
