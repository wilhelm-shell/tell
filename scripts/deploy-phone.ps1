# Build the client, install it to the connected KaiOS phone, and prefill
# localStorage (bridge url + token from bridge/.env) so the app boots
# straight into the hello screen without T9 typing on the phone.
#
# gdeploy corrupts the upload on Node 24+ (see CLAUDE.md) so we pin Node 22
# for this process only. PowerShell script-signing is bypassed for this
# process only - nothing about your system defaults changes.
#
# Override the Node 22 location with $env:NODE22_HOME if you did not unzip
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

# Read bridge/.env. We push these values into the phone's localStorage
# so the client does not need them baked into the bundle.
$envFile = Join-Path $repoRoot 'bridge\.env'
if (-not (Test-Path $envFile)) {
    Write-Error "bridge/.env not found - copy bridge/.env.example to bridge/.env first."
    exit 1
}
$envMap = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$') {
        $envMap[$Matches[1]] = $Matches[2]
    }
}
$bridgeHost = $envMap['BRIDGE_HOST']
$bridgePort = if ($envMap['BRIDGE_PORT']) { $envMap['BRIDGE_PORT'] } else { '8787' }
$bridgeToken = $envMap['BRIDGE_TOKEN']

if ($bridgeHost -in @('', '0.0.0.0', '127.0.0.1', 'localhost')) {
    Write-Error "BRIDGE_HOST=$bridgeHost is not reachable from the phone. Set it to your PC's LAN IP in bridge/.env."
    exit 1
}
if (-not $bridgeToken) {
    Write-Error "BRIDGE_TOKEN missing from bridge/.env"
    exit 1
}
$bridgeUrl = "http://${bridgeHost}:${bridgePort}"

# Build.
Push-Location (Join-Path $repoRoot 'client')
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'client build failed' }
} finally { Pop-Location }

Push-Location $repoRoot
try {
    # Each install gets a fresh UUID, so remove existing tell copies to
    # avoid pile-up on the phone.
    $listOutput = & gdeploy list
    foreach ($line in $listOutput) {
        $parts = ($line -as [string]) -split '\s+', 3
        if ($parts.Count -ge 3 -and $parts[0] -eq 'tell') {
            $oldManifest = $parts[2].Trim()
            Write-Host "Removing previous copy: $oldManifest"
            & gdeploy uninstall $oldManifest | Out-Null
        }
    }

    # Install the freshly-built app.
    & gdeploy install client/dist
    if ($LASTEXITCODE -ne 0) { throw 'gdeploy install failed' }

    # Look up the new manifest URL.
    $listOutput = & gdeploy list
    $manifest = $null
    foreach ($line in $listOutput) {
        $parts = ($line -as [string]) -split '\s+', 3
        if ($parts.Count -ge 3 -and $parts[0] -eq 'tell') {
            $manifest = $parts[2].Trim()
            break
        }
    }
    if (-not $manifest) { throw 'could not find tell app after install' }

    # Launch so the js runtime is up and evaluate can attach.
    & gdeploy start $manifest | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'gdeploy start failed' }
    Start-Sleep -Seconds 2

    # Prefill localStorage. Use only single quotes in the injected JS -
    # PS 5.1 native-command arg passing mangles embedded double quotes,
    # so any " in the JS string can silently break the eval.
    # Inline location.reload() only - do NOT use setTimeout to defer it.
    # The DevTools eval sandbox is torn down when the call returns, so
    # deferred callbacks (setTimeout, Promise.then) are orphaned and the
    # reload never fires.
    $urlEsc = ($bridgeUrl -replace '\\', '\\\\') -replace "'", "\'"
    $tokenEsc = ($bridgeToken -replace '\\', '\\\\') -replace "'", "\'"
    $js = "localStorage.setItem('bridge.url','$urlEsc'); localStorage.setItem('bridge.token','$tokenEsc'); location.reload();"
    & gdeploy evaluate $manifest $js | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'gdeploy evaluate failed' }

    Write-Host ""
    Write-Host "Done. App configured with bridge.url=$bridgeUrl"
} finally { Pop-Location }
