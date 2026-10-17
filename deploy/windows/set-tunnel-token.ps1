# Switches from the changing Quick Tunnel address to a fixed Named Tunnel (needs a domain on Cloudflare).
# Usage: .\set-tunnel-token.ps1 -Token "<token dari dashboard>" -Hostname "api.domainkamu.com"
# Back to Quick Tunnel: .\set-tunnel-token.ps1 -QuickTunnel
#Requires -RunAsAdministrator
param(
  [string]$Token = '',
  [string]$Hostname = '',
  [switch]$QuickTunnel
)
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$ConfigPath = "$Root\config.ps1"

if ($QuickTunnel) {
  if ($Token -or $Hostname) { throw 'Pakai -QuickTunnel sendiri, tanpa -Token dan -Hostname.' }
} else {
  $Token = $Token.Trim()
  if (-not $Token -and -not $Hostname) {
    throw 'Isi -Token dan -Hostname, atau pakai -QuickTunnel untuk kembali ke Quick Tunnel.'
  }
  if ($Token -and -not $Hostname) { throw '-Token diisi tapi -Hostname kosong. Isi juga -Hostname, misalnya "api.domainkamu.com".' }
  if ($Hostname -and -not $Token) { throw '-Hostname diisi tapi -Token kosong. Isi juga -Token dari dashboard Cloudflare.' }

  # Strip scheme and path, then require a plain hostname.
  $Hostname = ($Hostname.Trim().ToLower() -replace '^https?://', '') -replace '[/?#].*$', ''
  if ($Hostname -notmatch '^[a-z0-9.-]+$') { throw "Hostname tidak valid: '$Hostname'. Contoh yang benar: api.domainkamu.com" }

  # The installer wrapped the token in single quotes; quotes or spaces inside would break the config.
  if ($Token -match "[\s'`"]") { throw 'Token tidak boleh berisi spasi atau tanda kutip. Salin hanya teks panjang yang diawali eyJ.' }
}

$text = Get-Content $ConfigPath -Raw
# Config lines may end in CRLF, so match up to the closing quote instead of anchoring on $.
# In the replacement, $$ emits a literal $ (so escape every $ coming from the token).
$tokenRepl = $Token.Replace('$', '$$')
$hostRepl = $Hostname.Replace('$', '$$')
$tokenPattern = "(?m)^\`$TunnelToken = '[^'\r\n]*'"
$hostPattern = "(?m)^\`$PublicHostname = '[^'\r\n]*'"
if (($text -notmatch $tokenPattern) -or ($text -notmatch $hostPattern)) {
  throw "config.ps1 tidak berisi baris TunnelToken/PublicHostname. Jalankan ulang setup.ps1."
}
$text = $text -replace $tokenPattern, "`$`$TunnelToken = '$tokenRepl'"
$text = $text -replace $hostPattern, "`$`$PublicHostname = '$hostRepl'"
Set-Content -Path $ConfigPath -Value $text -Encoding UTF8 -NoNewline

Stop-ScheduledTask -TaskName 'ZenDrama Tunnel' -ErrorAction SilentlyContinue
$procs = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" |
  Where-Object { $_.CommandLine -like '*ZenDrama*' })
foreach ($x in $procs) { Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue }
if ($procs.Count -gt 0) {
  $ids = @($procs | ForEach-Object { $_.ProcessId })
  try { Wait-Process -Id $ids -Timeout 15 -ErrorAction SilentlyContinue } catch {}
}
# A task that is still "Running" ignores Start-ScheduledTask, so wait until it has stopped.
for ($i = 0; $i -lt 20; $i++) {
  $task = Get-ScheduledTask -TaskName 'ZenDrama Tunnel' -ErrorAction SilentlyContinue
  if (-not $task -or $task.State -ne 'Running') { break }
  Start-Sleep -Milliseconds 500
}
Start-ScheduledTask -TaskName 'ZenDrama Tunnel'

if ($Token) { Write-Host "Named Tunnel aktif. Alamat: https://$Hostname" -ForegroundColor Green }
else { Write-Host 'Kembali ke Quick Tunnel. Cek alamat baru dengan status.ps1 dalam ~30 detik.' -ForegroundColor Green }
