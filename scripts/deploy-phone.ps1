# Build the client and install it to the connected KaiOS phone via gdeploy.
#
# gdeploy corrupts the upload on Node 24+ (see CLAUDE.md) so we pin Node 22
# for this process only. PowerShell script-signing is bypassed for this
# process only — nothing about your system defaults changes.
#
# Override the Node 22 location with $env:NODE22_HOME if you didn't unzip
# to C:\node22.

$ErrorActionPreference = 'Stop'

$node22 = if ($env:NODE22_HOME) { $env:NODE22_HOME } else { 'C:\node22' }
if (-not (Test-Path (Join-Path $node22 'node.exe'))) {
    Write-Error "Node 22 not found at $node22. Set `$env:NODE22_HOME or unzip Node 22 there."
    exit 1
}

$env:PATH = "$node22;$env:PATH"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

Write-Host "Node: $(node --version)"

$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location (Join-Path $repoRoot 'client')
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'client build failed' }
} finally { Pop-Location }

Push-Location $repoRoot
try {
    & gdeploy install client/dist
    if ($LASTEXITCODE -ne 0) { throw 'gdeploy install failed' }
} finally { Pop-Location }
