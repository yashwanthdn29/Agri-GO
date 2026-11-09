$ErrorActionPreference = 'Stop'

$root = Join-Path $env:LOCALAPPDATA 'AgriGO\PostgreSQL17'
$bin = Join-Path $root 'pgsql\bin'
$data = Join-Path $root 'data'
$pgCtl = Join-Path $bin 'pg_ctl.exe'

if (-not (Test-Path $pgCtl) -or -not (Test-Path $data)) {
    throw 'AgriGO PostgreSQL is not installed or its database directory is missing.'
}

$env:PATH = "$bin;$(Join-Path $root 'pgsql\lib');$env:PATH"
& $pgCtl status -D $data *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Output 'AgriGO PostgreSQL is already running.'
    exit 0
}

& $pgCtl start -D $data -l (Join-Path $root 'postgresql.log') -w
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
