param(
  [string]$Label = "manual"
)

$ErrorActionPreference = "Stop"
$safe = $Label -replace '[^A-Za-z0-9._-]+', '-'
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tag = "backup/$safe-$stamp"
$sha = git rev-parse --short HEAD

git tag -a $tag -m "Backup before change: $Label ($sha)"
Write-Host "Created backup tag: $tag"
Write-Host "Restore with: git switch --detach $tag"
Write-Host "Compare with: git diff $tag"
