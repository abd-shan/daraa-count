param(
    [string]$EnvFile = '.env.example'
)

# This preflight uses installed dependencies. It does not build images, install
# packages, start containers, run migrations or modify environment files.
$ErrorActionPreference = 'Stop'
$repositoryPath = Split-Path -Parent $PSScriptRoot
$frozenFiles = @(
    'backend/package.json', 'backend/package-lock.json',
    'frontend/package.json', 'frontend/package-lock.json'
)
$originalHashes = @{}

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program failed with exit code $LASTEXITCODE."
    }
}

Push-Location $repositoryPath
try {
    foreach ($path in $frozenFiles) {
        $originalHashes[$path] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    }
    if (!(Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
        throw 'Environment file not found. Use .env.example for build preparation.'
    }
    foreach ($app in @('backend', 'frontend')) {
        if (!(Test-Path -LiteralPath "$app/node_modules" -PathType Container)) {
            throw "$app dependencies are missing. No installation was attempted."
        }
    }
    $dockerOperatingSystem = & docker info --format '{{.OSType}}'
    if ($LASTEXITCODE -ne 0 -or $dockerOperatingSystem.Trim() -ne 'linux') {
        throw 'A running Docker engine using Linux containers is required.'
    }
    Invoke-Checked 'docker' @('compose', '--env-file', $EnvFile, '--profile', 'tools', 'config', '--quiet')
    Invoke-Checked 'npm' @('run', 'build', '--prefix', 'backend')
    foreach ($entry in @('backend/dist/main.js', 'backend/dist/bootstrap.js')) {
        if (!(Test-Path -LiteralPath $entry -PathType Leaf)) {
            throw "Compiled entry point is missing: $entry"
        }
    }
    Invoke-Checked 'npm' @('run', 'build', '--prefix', 'frontend')
    Invoke-Checked 'docker' @('compose', '--env-file', $EnvFile, '--profile', 'tools', 'build', '--check', 'backend', 'web', 'migrations')
    Write-Host 'Docker preparation passed. Images were not built and no packages were installed.'
}
finally {
    try {
        foreach ($path in $originalHashes.Keys) {
            if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $originalHashes[$path]) {
                throw "Frozen dependency file changed: $path"
            }
        }
    }
    finally {
        Pop-Location
    }
}
