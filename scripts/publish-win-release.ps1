# Upload Windows release artifacts to a GitHub release tag, with a pre-flight
# check that every file electron-updater needs is present. Run from repo root.
#
# Usage: scripts\publish-win-release.ps1 v0.3.4

param(
  [Parameter(Mandatory = $true)]
  [string]$Tag
)

$ErrorActionPreference = 'Stop'

$Version = $Tag -replace '^v', ''
$Dist = 'dist-packages'

$required = @(
  "$Dist/latest.yml",
  "$Dist/Keel-$Version-win-x64.exe",
  "$Dist/Keel-$Version-win-x64.exe.blockmap",
  "$Dist/Keel-$Version-win-x64.zip",
  "$Dist/Keel-$Version-win-x64.zip.blockmap"
)

$missing = $required | Where-Object { -not (Test-Path $_) }
if ($missing.Count -gt 0) {
  Write-Error "Refusing to publish - missing artifacts:`n  $($missing -join "`n  ")`nRe-run 'npm run dist:win' and verify dist-packages\ before retrying."
  exit 1
}

$manifestPath = "$Dist/latest.yml"
$manifestVersionLine = Select-String -Path $manifestPath -Pattern '^version:' | Select-Object -First 1
$manifestVersion = ($manifestVersionLine.Line -replace '^version:\s*', '').Trim()
if ($manifestVersion -ne $Version) {
  Write-Error "latest.yml version ($manifestVersion) does not match tag ($Version)."
  exit 1
}

$referencedUrls = Select-String -Path $manifestPath -Pattern '^\s*-?\s*url:\s*(\S+)' -AllMatches |
  ForEach-Object { $_.Matches } |
  ForEach-Object { $_.Groups[1].Value }

foreach ($url in $referencedUrls) {
  if (-not (Test-Path "$Dist/$url")) {
    Write-Error "latest.yml references $url but $Dist\$url is missing."
    exit 1
  }
}

Write-Host "Uploading $($required.Count) artifacts to $Tag..."
& gh release upload $Tag @required --clobber
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Verifying release assets..."
$assets = (& gh release view $Tag --json assets -q '.assets[].name') -split "`n"
foreach ($f in $required) {
  $name = Split-Path $f -Leaf
  if ($assets -notcontains $name) {
    Write-Error "Asset $name did not appear on $Tag after upload."
    exit 1
  }
}

Write-Host "Done. $Tag has all Windows auto-updater artifacts."
