param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs
)

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $repoRoot 'supabase\functions\.env.local'

if (-not (Test-Path $envFile)) {
  throw "Missing env file at $envFile"
}

Set-Location $repoRoot
& "$repoRoot\supabase-local.ps1" functions serve --env-file $envFile --no-verify-jwt @ExtraArgs
exit $LASTEXITCODE
