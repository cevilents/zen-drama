# Removes the ZEN DRAMA server tasks and C:\ZenDrama. Node.js and cloudflared stay installed.
#Requires -RunAsAdministrator
$InstallDir = 'C:\ZenDrama'

foreach ($t in 'ZenDrama Server', 'ZenDrama Tunnel') {
  Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue
}

# Stopping the tasks only kills powershell.exe; stop node/cloudflared and wait until they release their files.
$procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cloudflared.exe'" |
  Where-Object { $_.CommandLine -like '*ZenDrama*' })
foreach ($x in $procs) { Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue }
if ($procs.Count -gt 0) {
  $ids = @($procs | ForEach-Object { $_.ProcessId })
  try { Wait-Process -Id $ids -Timeout 15 -ErrorAction SilentlyContinue } catch {}
}

# This process must not sit inside the folder it deletes (PowerShell cwd and .NET cwd are separate).
[Environment]::CurrentDirectory = "$env:SystemDrive\"
Set-Location "$env:SystemDrive\"

if (-not (Test-Path $InstallDir)) {
  Write-Host 'Folder C:\ZenDrama sudah tidak ada. Task otomatis sudah dihapus.' -ForegroundColor Green
  return
}

$removed = $false
$lastError = 'folder masih ada setelah dihapus'
for ($i = 0; $i -lt 3 -and -not $removed; $i++) {
  try {
    Remove-Item $InstallDir -Recurse -Force -ErrorAction Stop
    $removed = $true
  } catch {
    $lastError = $_.Exception.Message
    Start-Sleep -Seconds 2
  }
}

if ($removed -and -not (Test-Path $InstallDir)) {
  Write-Host 'ZEN DRAMA server sudah dihapus dari komputer ini.' -ForegroundColor Green
} else {
  Write-Host "Folder $InstallDir BELUM bisa dihapus: $lastError" -ForegroundColor Red
  Write-Host 'Tutup semua jendela PowerShell/Explorer yang sedang membuka C:\ZenDrama, lalu jalankan uninstall.ps1 lagi.' -ForegroundColor Yellow
  exit 1
}
