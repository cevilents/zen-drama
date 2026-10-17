# Keeps the ZEN DRAMA API server running; started at boot by the "ZenDrama Server" task.
$ErrorActionPreference = 'Continue'
$Root = $PSScriptRoot
. "$Root\config.ps1"

$env:PORT = "$Port"
# Only the tunnel on this PC talks to the server, so it is not exposed on the LAN.
$env:HOST = '127.0.0.1'
$env:PROXY_SECRET = $ProxySecret

$out = "$Root\logs\server.log"
$err = "$Root\logs\server.err.log"
$MaxLogBytes = 50MB

function Get-FileSize($path) {
  $i = Get-Item $path -ErrorAction SilentlyContinue
  if ($i) { return $i.Length }
  return 0
}

# Keep exactly one previous run: current -> .prev (replaces the older .prev).
function Rotate($path) {
  if (Test-Path $path) { Move-Item $path "$path.prev" -Force -ErrorAction SilentlyContinue }
}

# Stopping the scheduled task only kills powershell.exe, so a node.exe from the previous run
# can still be alive and holding the port. Kill it and wait for it to exit before starting.
$orphans = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*ZenDrama*' })
foreach ($o in $orphans) { Stop-Process -Id $o.ProcessId -Force -ErrorAction SilentlyContinue }
if ($orphans.Count -gt 0) {
  $ids = @($orphans | ForEach-Object { $_.ProcessId })
  try { Wait-Process -Id $ids -Timeout 15 -ErrorAction SilentlyContinue } catch {}
}

while ($true) {
  Rotate $out; Rotate $err
  try {
    $p = Start-Process -FilePath $NodeExe -ArgumentList "`"$Root\server\index.mjs`"" `
      -WorkingDirectory "$Root\server" -NoNewWindow -PassThru -ErrorAction Stop `
      -RedirectStandardOutput $out -RedirectStandardError $err
  } catch {
    Add-Content $err "[$(Get-Date -Format s)] gagal menjalankan node: $($_.Exception.Message)"
    Start-Sleep -Seconds 30
    continue
  }
  # Touching Handle makes .NET keep it, so ExitCode is populated after the process ends.
  $null = $p.Handle
  # A server that runs for weeks must not fill the disk: restart it when a log gets too big.
  while (-not $p.WaitForExit(60000)) {
    if ((Get-FileSize $out) -gt $MaxLogBytes -or (Get-FileSize $err) -gt $MaxLogBytes) {
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
      $null = $p.WaitForExit(15000)
    }
  }
  Add-Content $out "[$(Get-Date -Format s)] server exited with code $($p.ExitCode), restarting in 5s"
  Start-Sleep -Seconds 5
}
