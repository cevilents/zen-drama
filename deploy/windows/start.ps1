# Turns the ZEN DRAMA server back ON (after "Matikan server") and re-enables auto-start at boot.
# Run from the ZEN-DRAMA-SERVER.bat menu.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Continue'

foreach ($t in 'ZenDrama Server', 'ZenDrama Tunnel') {
  Enable-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue | Out-Null
}

# Clear any leftovers first so the runner scripts re-arm cleanly, then start.
foreach ($t in 'ZenDrama Server', 'ZenDrama Tunnel') { Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue }
$procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cloudflared.exe'" |
  Where-Object { $_.CommandLine -like '*ZenDrama*' })
foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
if ($procs.Count -gt 0) {
  try { Wait-Process -Id @($procs | ForEach-Object { $_.ProcessId }) -Timeout 15 -ErrorAction SilentlyContinue } catch {}
}
foreach ($t in 'ZenDrama Server', 'ZenDrama Tunnel') { Start-ScheduledTask -TaskName $t }

Write-Host ''
Write-Host 'Server ZEN DRAMA DINYALAKAN.' -ForegroundColor Green
Write-Host 'Alamat publik siap dalam ~1-2 menit (cek lewat "Lihat status").' -ForegroundColor Green
Write-Host 'Server juga akan menyala sendiri lagi setiap Windows hidup.' -ForegroundColor Green
