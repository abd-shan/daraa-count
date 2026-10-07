# Run from the project root. Compose reads credentials from the untracked .env.
param([string]$Destination = (Join-Path $PSScriptRoot '..\backups'))
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$filename = 'count-daraa-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.dump'
$remote = '/tmp/' + $filename
$local = Join-Path $Destination $filename
try {
  docker compose exec -T db pg_dump -U count_daraa -d count_daraa -Fc -f $remote
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
  docker compose cp ('db:' + $remote) ($local + '.partial')
  if ($LASTEXITCODE -ne 0) { throw 'Backup copy failed' }
  Move-Item -LiteralPath ($local + '.partial') -Destination $local
  Write-Output ('Backup created: ' + $local)
} finally {
  docker compose exec -T db rm -f $remote
}
