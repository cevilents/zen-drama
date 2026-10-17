# Shows whether the ZEN DRAMA server and tunnel are running, plus the public address
# and the address the app currently gets from the pointer.
#Requires -RunAsAdministrator
$Root = $PSScriptRoot
. "$Root\config.ps1"

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

Write-Host "`n== Task ==" -ForegroundColor Cyan
Get-ScheduledTask -TaskName 'ZenDrama *' | Select-Object TaskName, State | Format-Table -AutoSize

Write-Host '== Server (lokal) ==' -ForegroundColor Cyan
try {
  $h = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 10
  $up = @($h.sources.PSObject.Properties | Where-Object { $_.Value -eq 'up' }).Count
  $all = @($h.sources.PSObject.Properties).Count
  Write-Host "Jalan. Sumber aktif: $up/$all" -ForegroundColor Green
} catch {
  Write-Host "Tidak merespons: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n== Alamat publik ==" -ForegroundColor Cyan
$url = (Get-Content "$Root\PUBLIC_URL.txt" -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($url) { Write-Host $url -ForegroundColor Green } else { Write-Host '(belum ada)' -ForegroundColor Yellow }
if ($url -like 'https://*') {
  try {
    Invoke-RestMethod "$url/api/health" -TimeoutSec 15 | Out-Null
    Write-Host 'Bisa diakses dari internet.' -ForegroundColor Green
  } catch {
    Write-Host "Belum bisa diakses dari internet: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}
if (-not $TunnelToken) {
  Write-Host 'Mode Quick Tunnel (untuk uji coba): alamat ini BERUBAH setiap komputer/tunnel restart.' -ForegroundColor Yellow
}

Write-Host "`n== Pointer (alamat yang dibaca aplikasi) ==" -ForegroundColor Cyan
if (-not $PointerUrl) {
  Write-Host 'PointerUrl tidak ada di config.ps1. Jalankan ulang setup.ps1.' -ForegroundColor Yellow
} else {
  try {
    $ptr = Invoke-RestMethod $PointerUrl -TimeoutSec 15
    if ($ptr -is [string]) { $ptr = $ptr | ConvertFrom-Json }
    Write-Host "Pointer berisi: $($ptr.url)   (diperbarui: $($ptr.updatedAt))"
    if ($url -like 'https://*') {
      if ("$($ptr.url)".TrimEnd('/') -ieq "$url".TrimEnd('/')) {
        Write-Host 'COCOK dengan alamat publik. Aplikasi akan menemukan server ini.' -ForegroundColor Green
      } else {
        Write-Host 'TIDAK COCOK dengan alamat publik. Tunggu ~1 menit lalu cek lagi; kalau tetap, lihat baris "pointer" di logs\tunnel.log.' -ForegroundColor Yellow
      }
    }
  } catch {
    Write-Host "Gagal membaca pointer: $($_.Exception.Message)" -ForegroundColor Yellow
  }
  if (-not $PointerKey) {
    Write-Host 'PointerKey kosong: alamat tidak dikirim otomatis. Taruh pointer-key.txt di folder ZIP lalu jalankan ulang setup.ps1.' -ForegroundColor Yellow
  }
}

Write-Host "`n== Log terakhir ==" -ForegroundColor Cyan
foreach ($f in 'server.log', 'server.err.log', 'tunnel.log', 'tunnel.cf.log') {
  $path = "$Root\logs\$f"
  if (Test-Path $path) {
    Write-Host "-- $f"
    Get-Content $path -Tail 5
  }
}
