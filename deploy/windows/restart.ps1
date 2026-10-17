# Restarts the ZEN DRAMA server and tunnel cleanly (also kills leftover node/cloudflared processes).
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Continue'

$tasks = 'ZenDrama Server', 'ZenDrama Tunnel'

foreach ($t in $tasks) { Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue }

# Stopping a task only kills powershell.exe; node/cloudflared must be stopped explicitly.
$procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cloudflared.exe'" |
  Where-Object { $_.CommandLine -like '*ZenDrama*' })
foreach ($x in $procs) { Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue }
if ($procs.Count -gt 0) {
  $ids = @($procs | ForEach-Object { $_.ProcessId })
  try { Wait-Process -Id $ids -Timeout 15 -ErrorAction SilentlyContinue } catch {}
}

# A task that is still "Running" ignores Start-ScheduledTask, so wait until both are stopped.
foreach ($t in $tasks) {
  for ($i = 0; $i -lt 20; $i++) {
    $task = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    if (-not $task -or $task.State -ne 'Running') { break }
    Start-Sleep -Milliseconds 500
  }
}

foreach ($t in $tasks) { Start-ScheduledTask -TaskName $t }
Write-Host 'Server dan tunnel dijalankan ulang. Cek dengan status.ps1 dalam ~30 detik.' -ForegroundColor Green
