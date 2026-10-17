# ZEN DRAMA server - installer for an always-on Windows PC.
# Run once from an elevated PowerShell (see PANDUAN.txt). Safe to re-run to update the server code;
# the existing tunnel token, proxy secret and pointer settings in C:\ZenDrama\config.ps1 are kept.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$InstallDir = 'C:\ZenDrama'
$Port = 3030
$Src = $PSScriptRoot

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Find-Exe($name, $candidates) {
  Refresh-Path
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  return $null
}

# winget returns non-zero for "already installed" / "no applicable upgrade"; that is not an error here.
function Invoke-Winget {
  param([string[]]$WingetArgs)
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & winget @WingetArgs | Out-Host } catch {} finally { $ErrorActionPreference = $old }
}

function Get-NodeMajor($exe) {
  try { return [int]((& $exe --version).ToString().TrimStart('v').Split('.')[0]) } catch { return 0 }
}

# Prefer the machine-wide install (the scheduled tasks run as SYSTEM, which cannot use per-user installs).
function Resolve-Node {
  $pf = "$env:ProgramFiles\nodejs\node.exe"
  if ((Test-Path $pf) -and ((Get-NodeMajor $pf) -ge 20)) { return $pf }
  $c = Find-Exe 'node' @()
  if ($c -and ($c -notlike "$env:SystemDrive\Users\*") -and ((Get-NodeMajor $c) -ge 20)) { return $c }
  return $null
}

# Stops our node/cloudflared processes and waits (max 15 s) until their files are released.
function Stop-ZenProcesses {
  $procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cloudflared.exe'" |
    Where-Object { $_.CommandLine -like '*ZenDrama*' })
  foreach ($x in $procs) { Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue }
  if ($procs.Count -gt 0) {
    $ids = @($procs | ForEach-Object { $_.ProcessId })
    try { Wait-Process -Id $ids -Timeout 15 -ErrorAction SilentlyContinue } catch {}
  }
}

# --- Pre-flight checks -----------------------------------------------------------------------
if (-not $Src) {
  throw 'Tidak bisa menentukan lokasi setup.ps1. Jalankan dengan: powershell -ExecutionPolicy Bypass -File .\setup.ps1'
}
$srcNorm = $Src.TrimEnd('\')
if (($srcNorm -ieq $InstallDir) -or $srcNorm.StartsWith("$InstallDir\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "setup.ps1 dijalankan dari $InstallDir. Jalankan dari folder hasil ekstrak ZIP (misalnya Downloads\zen-drama-server-windows), bukan dari $InstallDir."
}
if (-not (Test-Path (Join-Path $Src 'server\index.mjs'))) {
  throw "Folder 'server' tidak ditemukan di sebelah setup.ps1. Ekstrak seluruh ZIP dulu."
}
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw "winget tidak ada. Install 'App Installer' dari Microsoft Store, lalu jalankan ulang."
}

Step 'Menghentikan versi lama (kalau ada)'
# Stop a previous install (runner scripts first, then their node/cloudflared children)
# so files can be overwritten and the new code is what runs.
foreach ($t in 'ZenDrama Server', 'ZenDrama Tunnel') { Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue }
Stop-ZenProcesses
# The old address is dead once the old tunnel stops; the final check must only see the new one.
Remove-Item "$InstallDir\PUBLIC_URL.txt" -Force -ErrorAction SilentlyContinue

Step 'Memasang Node.js LTS'
$WingetCommon = @('--silent', '--accept-package-agreements', '--accept-source-agreements')
$NodeExe = Resolve-Node
if ($NodeExe) {
  Write-Host 'Memeriksa pembaruan Node.js...'
  Invoke-Winget (@('upgrade', '--id', 'OpenJS.NodeJS.LTS', '-e') + $WingetCommon)
}
else {
  Invoke-Winget (@('install', '--id', 'OpenJS.NodeJS.LTS', '-e', '--scope', 'machine') + $WingetCommon)
  if (-not (Resolve-Node)) {
    # An old Node (below 20) may already be installed: upgrade it instead.
    Invoke-Winget (@('upgrade', '--id', 'OpenJS.NodeJS.LTS', '-e') + $WingetCommon)
  }
}
$NodeExe = Resolve-Node
if (-not $NodeExe) { throw 'Node.js versi 20 ke atas gagal terpasang. Pasang manual dari nodejs.org (versi LTS), lalu jalankan ulang setup.' }
Write-Host "Node: $NodeExe ($(& $NodeExe --version))"

Step 'Memasang cloudflared'
$cfCandidates = @("${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe")
$CfSource = Find-Exe 'cloudflared' $cfCandidates
if (-not $CfSource) {
  Invoke-Winget (@('install', '--id', 'Cloudflare.cloudflared', '-e', '--scope', 'machine') + $WingetCommon)
}
else {
  Write-Host 'Memeriksa pembaruan cloudflared...'
  Invoke-Winget (@('upgrade', '--id', 'Cloudflare.cloudflared', '-e') + $WingetCommon)
}
$CfSource = Find-Exe 'cloudflared' $cfCandidates
if (-not $CfSource) { throw 'cloudflared gagal terpasang.' }

Step "Menyalin file ke $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir, "$InstallDir\bin", "$InstallDir\logs" | Out-Null
# C:\ inherits "Authenticated Users: modify" into new folders, and the tasks below run these files as SYSTEM.
# Lock the folder down BEFORE copying anything: Administrators + SYSTEM full, Users read/execute only.
# No /T: children inherit this automatically, and /T would hand Users read access to config.ps1 on a re-run
# (config.ps1 has its own stricter ACL, set further down).
icacls $InstallDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Gagal mengunci izin akses $InstallDir (icacls kode $LASTEXITCODE)." }
# The scheduled tasks run as SYSTEM, so keep a private copy of cloudflared at a fixed path.
Copy-Item $CfSource "$InstallDir\bin\cloudflared.exe" -Force
if (Test-Path "$InstallDir\server") { Remove-Item "$InstallDir\server" -Recurse -Force }
Copy-Item (Join-Path $Src 'server') "$InstallDir\server" -Recurse -Force
foreach ($f in 'run-server.ps1', 'run-tunnel.ps1', 'status.ps1', 'restart.ps1', 'set-tunnel-token.ps1', 'uninstall.ps1') {
  Copy-Item (Join-Path $Src $f) "$InstallDir\$f" -Force
}
Get-ChildItem $InstallDir -Recurse -File | Unblock-File

Step 'Menulis konfigurasi'
$ConfigPath = "$InstallDir\config.ps1"
$TunnelToken = ''
$PublicHostname = ''
$ProxySecret = ''
$PointerUrl = 'https://zen-drama.zen-drama.workers.dev/server.json'
$PointerKey = ''
if (Test-Path $ConfigPath) {
  # Keep only the token, secret and pointer settings from the old config; paths are re-detected above.
  $old = & { . $ConfigPath; @{ Token = $TunnelToken; Hostname = $PublicHostname; Secret = $ProxySecret; PUrl = $PointerUrl; PKey = $PointerKey } }
  $TunnelToken = $old.Token
  $PublicHostname = $old.Hostname
  $ProxySecret = $old.Secret
  if ($old.PUrl) { $PointerUrl = $old.PUrl }
  if ($old.PKey) { $PointerKey = $old.PKey }
}
if (-not $ProxySecret) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $ProxySecret = ([BitConverter]::ToString($bytes)).Replace('-', '').ToLower()
}
# pointer-key.txt (next to this script) wins over an old key; if it is missing, the old key stays.
$KeyFile = Join-Path $Src 'pointer-key.txt'
if (Test-Path $KeyFile) {
  $rawKey = Get-Content $KeyFile -Raw -ErrorAction SilentlyContinue
  if ($rawKey -and $rawKey.Trim()) { $PointerKey = $rawKey.Trim() }
}
if ($PointerKey -match "[\s'`"]") { throw 'pointer-key.txt berisi spasi atau tanda kutip. Isinya harus satu baris kunci saja.' }
if (-not $PointerKey) {
  Write-Host 'pointer-key.txt tidak ditemukan: alamat server TIDAK akan diperbarui otomatis ke aplikasi.' -ForegroundColor Yellow
}
@"
# Dibuat oleh setup.ps1. Ubah TunnelToken lewat set-tunnel-token.ps1.
`$NodeExe = '$NodeExe'
`$CloudflaredExe = '$InstallDir\bin\cloudflared.exe'
`$Port = $Port
`$ProxySecret = '$ProxySecret'
`$TunnelToken = '$TunnelToken'
`$PublicHostname = '$PublicHostname'
`$PointerUrl = '$PointerUrl'
`$PointerKey = '$PointerKey'
"@ | Set-Content -Path $ConfigPath -Encoding UTF8
# Only Administrators and SYSTEM may read the secret and token (SIDs work on any Windows language).
icacls $ConfigPath /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Gagal mengunci izin akses $ConfigPath (icacls kode $LASTEXITCODE)." }

Step 'Mendaftarkan task otomatis (jalan saat Windows menyala)'
# SYSTEM account name for the current Windows language, resolved from its well-known SID (S-1-5-18).
$SystemAccount = (New-Object Security.Principal.SecurityIdentifier 'S-1-5-18').Translate([Security.Principal.NTAccount]).Value
function Register-ZenTask($name, $script) {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstallDir\$script`""
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId $SystemAccount -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -Priority 4 `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName $name
}
Register-ZenTask 'ZenDrama Server' 'run-server.ps1'
Register-ZenTask 'ZenDrama Tunnel' 'run-tunnel.ps1'

Step 'Mencegah komputer tidur saat dicolok listrik'
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

Step 'Menunggu server menyala'
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  try { Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 5 | Out-Null; $ok = $true; break } catch {}
}
if (-not $ok) {
  throw "Server tidak mau menyala. Cek log: $InstallDir\logs\server.err.log"
}
Write-Host 'Server jalan.' -ForegroundColor Green

Step 'Menyambungkan ke internet dan ke aplikasi (maksimal 3 menit)'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$publicUrl = $null
$reachable = $false
$linked = $false
$sw = [Diagnostics.Stopwatch]::StartNew()
while (-not $linked -and $sw.Elapsed.TotalSeconds -lt 180) {
  Start-Sleep -Seconds 3
  Write-Host '.' -NoNewline
  $line = Get-Content "$InstallDir\PUBLIC_URL.txt" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($line -like 'https://*') { $publicUrl = $line.Trim().TrimEnd('/') }
  if (-not $publicUrl) { continue }
  # Success means the new address really answers from the internet...
  if (-not $reachable) {
    try { Invoke-RestMethod "$publicUrl/api/health" -TimeoutSec 5 | Out-Null; $reachable = $true } catch { continue }
  }
  # ...and the pointer (run-tunnel.ps1 posts it) hands that same address to the app.
  if (-not $PointerKey) { $linked = $true; continue }
  try {
    $p = Invoke-RestMethod $PointerUrl -TimeoutSec 5
    if ($p.url -and ($p.url.TrimEnd('/') -eq $publicUrl)) { $linked = $true }
  } catch {}
}
Write-Host ''

Write-Host ''
if ($linked) {
  Write-Host '============================================================' -ForegroundColor Green
  Write-Host '  BERHASIL. Server ZEN DRAMA aktif.' -ForegroundColor Green
  Write-Host "  Alamat publik: $publicUrl" -ForegroundColor Green
  Write-Host '  Aplikasi & web otomatis tersambung (tunggu +-1 menit).' -ForegroundColor Green
  Write-Host '  Server menyala sendiri setiap Windows hidup.' -ForegroundColor Green
  Write-Host '  Jendela ini boleh ditutup.' -ForegroundColor Green
  Write-Host '============================================================' -ForegroundColor Green
} elseif ($reachable) {
  Write-Host "Server jalan dan bisa diakses di $publicUrl," -ForegroundColor Yellow
  Write-Host 'tapi alamatnya belum terkirim ke aplikasi. Biasanya beres sendiri dalam beberapa menit;' -ForegroundColor Yellow
  Write-Host 'cek lagi dengan klik dua kali file pemasang lalu pilih "Lihat status".' -ForegroundColor Yellow
} else {
  Write-Host 'Server sudah terpasang dan jalan, tapi belum bisa diakses dari internet.' -ForegroundColor Yellow
  Write-Host 'Pastikan komputer tersambung internet. Biasanya beres sendiri dalam beberapa menit;' -ForegroundColor Yellow
  Write-Host 'cek lagi dengan klik dua kali file pemasang lalu pilih "Lihat status".' -ForegroundColor Yellow
}
