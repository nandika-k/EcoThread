param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$SupabaseArgs
)

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$cliPath = Join-Path $repoRoot 'tools\supabase-cli\supabase.exe'

if (-not (Test-Path $cliPath)) {
  throw "Supabase CLI not found at $cliPath"
}

Set-Location $repoRoot
& $cliPath @SupabaseArgs
exit $LASTEXITCODE
