# Turns the ZEN DRAMA server OFF and keeps it off, including across Windows restarts,
# until "Nyalakan server" is chosen. Run from the ZEN-DRAMA-SERVER.bat menu.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Continue'

# Disabling the startup tasks is what makes it stay off after a reboot.
foreach ($t in 'ZenDrama Server', 'ZenDrama Tunnel') {
  Disable-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue | Out-Null
  Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
}

# Stopping a task only kills its powershell wrapper; stop the node/cloudflared children too.
$procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cloudflared.exe'" |
  Where-Object { $_.CommandLine -like '*ZenDrama*' })
foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-Item 'C:\ZenDrama\PUBLIC_URL.txt' -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host 'Server ZEN DRAMA DIMATIKAN.' -ForegroundColor Yellow
Write-Host 'Tetap mati walau Windows di-restart, sampai kamu pilih "Nyalakan server".' -ForegroundColor Yellow
Write-Host 'Selama mati, aplikasi & web tidak bisa memuat drama.' -ForegroundColor Yellow
