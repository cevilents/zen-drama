@echo off
rem ZEN DRAMA Server - one-file installer for Windows 10/11.
rem Double-click, choose "Yes" when Windows asks for Administrator, done.
rem The whole package (server + scripts) is embedded as base64 after the marker line at the end;
rem build-installer.sh generates this file, so edit installer-header.bat, not the generated .bat.
setlocal
title ZEN DRAMA Server
set "ZEN_BAT=%~f0"

rem fltmc only succeeds when elevated and, unlike "net session", does not need the Server service.
fltmc >nul 2>&1
if not errorlevel 1 goto elevated
if "%~1"=="elevated" (
  echo Gagal mendapat izin Administrator. Klik kanan file ini lalu pilih "Run as administrator".
  pause
  exit /b 1
)
echo Meminta izin Administrator... pilih "Yes" di jendela yang muncul.
powershell -NoProfile -Command "try { Start-Process -FilePath $env:ZEN_BAT -ArgumentList 'elevated' -Verb RunAs -ErrorAction Stop } catch { exit 1 }"
if errorlevel 1 (
  echo.
  echo Izin Administrator ditolak. Jalankan file ini lagi dan pilih "Yes".
  pause
)
exit /b

:elevated
set "ZEN_ACTION=install"
if not exist "C:\ZenDrama\config.ps1" goto run
echo.
echo   ZEN DRAMA Server sudah terpasang di komputer ini.
echo.
echo     1. Perbarui / pasang ulang
echo     2. Lihat status
echo     3. Restart server
echo     4. Matikan server (sampai dinyalakan lagi)
echo     5. Nyalakan server
echo     6. Hapus server dari komputer ini
echo     7. Keluar
echo.
choice /c 1234567 /n /m "  Pilih 1-7: "
rem Ctrl+C makes choice return 0: treat as "exit" rather than falling through to a reinstall.
if not errorlevel 1 exit /b
rem "if errorlevel N" means N or higher, so test in ascending order and let the last match win.
if errorlevel 1 set "ZEN_ACTION=install"
if errorlevel 2 set "ZEN_ACTION=status"
if errorlevel 3 set "ZEN_ACTION=restart"
if errorlevel 4 set "ZEN_ACTION=stop"
if errorlevel 5 set "ZEN_ACTION=start"
if errorlevel 6 set "ZEN_ACTION=uninstall"
if errorlevel 7 exit /b

if "%ZEN_ACTION%"=="status" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "C:\ZenDrama\status.ps1"
  goto done
)
if "%ZEN_ACTION%"=="restart" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "C:\ZenDrama\restart.ps1"
  goto done
)
if not "%ZEN_ACTION%"=="uninstall" goto run
echo.
choice /c YN /m "  Yakin hapus server ZEN DRAMA dari komputer ini"
if errorlevel 2 exit /b
if not errorlevel 1 exit /b

:run
echo.
echo Menyiapkan paket ZEN DRAMA...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $dir = $null; try { $text = [IO.File]::ReadAllText($env:ZEN_BAT); $mark = '__ZEN' + 'PAYLOAD__'; $at = $text.LastIndexOf($mark, [StringComparison]::Ordinal); if ($at -lt 0) { throw 'File pemasang rusak (paket tidak ditemukan). Unduh ulang file .bat-nya.' }; $bytes = [Convert]::FromBase64String($text.Substring($at + $mark.Length)); $dir = Join-Path $env:TEMP ('ZenDramaSetup-' + [guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $dir | Out-Null; $zip = Join-Path $dir 'paket.zip'; [IO.File]::WriteAllBytes($zip, $bytes); Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($zip, (Join-Path $dir 'pkg')); $script = switch ($env:ZEN_ACTION) { 'uninstall' { 'uninstall.ps1' } 'stop' { 'stop.ps1' } 'start' { 'start.ps1' } default { 'setup.ps1' } }; & (Join-Path $dir ('pkg\' + $script)) } catch { Write-Host ''; Write-Host ('GAGAL: ' + $_.Exception.Message) -ForegroundColor Red; if ($_.InvocationInfo) { Write-Host $_.InvocationInfo.PositionMessage -ForegroundColor DarkGray }; Write-Host 'Kirim pesan di atas ke developer.' -ForegroundColor Yellow; $host.SetShouldExit(1) } finally { [Environment]::CurrentDirectory = $env:SystemRoot; Set-Location $env:SystemRoot; if ($dir) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue } }"

:done
echo.
pause
exit /b
