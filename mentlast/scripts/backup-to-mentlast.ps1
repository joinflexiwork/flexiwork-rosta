# Backup project source to mentlast folder (excludes node_modules and .next)
$ErrorActionPreference = "Stop"
$root = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { Get-Location }
$dest = Join-Path $root "mentlast"

if (Test-Path $dest) {
  Remove-Item -Recurse -Force $dest
}

# Use robocopy for fast copy with exclusions (Windows)
$result = & robocopy "$root" "$dest" /E /XD node_modules .next mentlast .git /NFL /NDL /NJH /NJS /NC /NS
$rc = $LASTEXITCODE
# Robocopy: 0 = no copy, 1-7 = success, 8+ = failure
if ($rc -ge 8) {
  Write-Error "Robocopy failed with exit code $rc"
  exit $rc
}
Write-Host "Backup complete: $dest"
