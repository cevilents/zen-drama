# Keeps the Cloudflare Tunnel running; started at boot by the "ZenDrama Tunnel" task.
# No token  -> Quick Tunnel: free random https://*.trycloudflare.com address that changes on restart.
# Token set -> Named Tunnel: fixed address configured in the Cloudflare dashboard.
# Whenever the public address is known it is posted to the "pointer" so the app finds the server.
$ErrorActionPreference = 'Continue'
$Root = $PSScriptRoot
. "$Root\config.ps1"

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# tunnel.log    = this script's own events (start/exit/pointer results)
# tunnel.cf.log = cloudflared's log (stderr), tunnel.out.log = its stdout; each kept as current + .prev
$log = "$Root\logs\tunnel.log"
$cfLog = "$Root\logs\tunnel.cf.log"
$outLog = "$Root\logs\tunnel.out.log"
$urlFile = "$Root\PUBLIC_URL.txt"
$MaxLogBytes = 50MB
$MaxPointerAttempts = 10
$PointerSlowRetrySeconds = 300
$PointerVerifySeconds = 600
# api.trycloudflare.com shows up in cloudflared error lines and is not our address.
$UrlRegex = 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com'

function Write-TunnelLog($msg) {
  Add-Content -Path $log -Value "[$(Get-Date -Format s)] $msg"
}

function Get-FileSize($path) {
  $i = Get-Item $path -ErrorAction SilentlyContinue
  if ($i) { return $i.Length }
  return 0
}

function Rotate($path) {
  if (Test-Path $path) { Move-Item $path "$path.prev" -Force -ErrorAction SilentlyContinue }
}

# A fresh quick tunnel needs a few seconds before it answers; wait up to ~60 s for /api/health.
function Wait-Reachable($url, $proc) {
  for ($i = 0; $i -lt 12; $i++) {
    if ($proc.HasExited) { return $false }
    try { Invoke-RestMethod "$url/api/health" -TimeoutSec 8 | Out-Null; return $true } catch {}
    Start-Sleep -Seconds 5
  }
  return $false
}

function Send-Pointer($url) {
  $body = @{ url = $url } | ConvertTo-Json -Compress
  return Invoke-RestMethod -Uri $PointerUrl -Method Post -TimeoutSec 15 `
    -Headers @{ Authorization = "Bearer $PointerKey" } -ContentType 'application/json' -Body $body
}

# Stopping the scheduled task only kills powershell.exe, so a cloudflared.exe from the previous
# run can still be alive. Kill it and wait for it to exit before starting.
$orphans = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" |
  Where-Object { $_.CommandLine -like '*ZenDrama*' })
foreach ($o in $orphans) { Stop-Process -Id $o.ProcessId -Force -ErrorAction SilentlyContinue }
if ($orphans.Count -gt 0) {
  $ids = @($orphans | ForEach-Object { $_.ProcessId })
  try { Wait-Process -Id $ids -Timeout 15 -ErrorAction SilentlyContinue } catch {}
}

while ($true) {
  if ((Get-FileSize $log) -gt 10MB) { Rotate $log }
  Rotate $cfLog; Rotate $outLog

  if ($TunnelToken) {
    # cloudflared reads the token from TUNNEL_TOKEN, so it never appears on the command line.
    $env:TUNNEL_TOKEN = $TunnelToken
    $cfArgs = @('tunnel', '--no-autoupdate', 'run')
    if ($PublicHostname) { $url = "https://$PublicHostname" } else { $url = $null }
    if ($url) { Set-Content $urlFile $url } else { Set-Content $urlFile '(Named Tunnel tanpa hostname - jalankan set-tunnel-token.ps1)' }
  } else {
    Remove-Item Env:\TUNNEL_TOKEN -ErrorAction SilentlyContinue
    $cfArgs = @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$Port")
    $url = $null
    Set-Content $urlFile '(menunggu alamat Quick Tunnel...)'
  }

  try {
    $p = Start-Process -FilePath $CloudflaredExe -ArgumentList $cfArgs -NoNewWindow -PassThru -ErrorAction Stop `
      -RedirectStandardOutput $outLog -RedirectStandardError $cfLog
  } catch {
    Write-TunnelLog "gagal menjalankan cloudflared: $($_.Exception.Message)"
    Start-Sleep -Seconds 30
    continue
  }
  # Touching Handle makes .NET keep it, so ExitCode is populated after the process ends.
  $null = $p.Handle
  Write-TunnelLog "cloudflared started (pid $($p.Id))"

  $posted = $false
  $attempts = 0
  $nextTry = [DateTime]::MinValue
  $nextVerify = [DateTime]::MaxValue
  $reachChecked = $false
  $warnedNoKey = $false
  $lastSizeCheck = Get-Date

  # Ticks every 5 s: learn the address, tell the pointer (never fatal), and watch the log size.
  while (-not $p.WaitForExit(5000)) {
    try {
      if (-not $url -and -not $TunnelToken) {
        # cloudflared prints the generated address to stderr shortly after connecting.
        $txt = Get-Content -Path $cfLog -Raw -ErrorAction SilentlyContinue
        if ($txt) {
          $m = [regex]::Match($txt, $UrlRegex)
          if ($m.Success) {
            $url = $m.Value
            Set-Content $urlFile $url
            Write-TunnelLog "Quick Tunnel address: $url"
          }
        }
      }

      if ($url) {
        if (-not $PointerKey -or -not $PointerUrl) {
          if (-not $warnedNoKey) {
            $warnedNoKey = $true
            Write-TunnelLog 'pointer: PointerKey/PointerUrl kosong di config.ps1, alamat tidak dikirim ke pointer'
          }
        } elseif (-not $posted) {
          # First $MaxPointerAttempts tries are 30 s apart, then one try every 5 minutes, never giving up.
          if ((Get-Date) -ge $nextTry) {
            if (-not $reachChecked) {
              $reachChecked = $true
              if (Wait-Reachable $url $p) { Write-TunnelLog "pointer: $url sudah menjawab /api/health" }
              else { Write-TunnelLog "pointer: $url belum menjawab /api/health setelah ~60 detik, tetap dikirim" }
            }
            if (-not $p.HasExited) {
              $attempts++
              try {
                $resp = Send-Pointer $url
                if ($resp -and $resp.ok -eq $true) {
                  $posted = $true
                  $nextVerify = (Get-Date).AddSeconds($PointerVerifySeconds)
                  Write-TunnelLog "pointer: OK, $url terkirim (percobaan $attempts)"
                } else {
                  throw 'balasan pointer tidak berisi ok=true'
                }
              } catch {
                if ($attempts -lt $MaxPointerAttempts) {
                  Write-TunnelLog "pointer: GAGAL (percobaan $attempts/$MaxPointerAttempts): $($_.Exception.Message)"
                  $nextTry = (Get-Date).AddSeconds(30)
                } else {
                  Write-TunnelLog "pointer: GAGAL (percobaan $attempts), coba lagi tiap $([int]($PointerSlowRetrySeconds / 60)) menit: $($_.Exception.Message)"
                  $nextTry = (Get-Date).AddSeconds($PointerSlowRetrySeconds)
                }
              }
            }
          }
        } elseif ((Get-Date) -ge $nextVerify) {
          # Every ~10 minutes read back what the pointer serves; if it is not our address, post again.
          $nextVerify = (Get-Date).AddSeconds($PointerVerifySeconds)
          try {
            $cur = Invoke-RestMethod -Uri $PointerUrl -Method Get -TimeoutSec 10
            $curUrl = ''
            if ($cur -and $cur.url) { $curUrl = ([string]$cur.url).TrimEnd('/') }
            if ($curUrl -ne $url.TrimEnd('/')) {
              Write-TunnelLog "pointer: alamat di pointer ($curUrl) berbeda dari $url, kirim ulang"
              $posted = $false
              $attempts = 0
              $nextTry = [DateTime]::MinValue
            }
          } catch {
            Write-TunnelLog "pointer: gagal membaca pointer: $($_.Exception.Message)"
          }
        }
      }
    } catch {
      Write-TunnelLog "pemantau tunnel error: $($_.Exception.Message)"
    }

    # A tunnel that runs for weeks must not fill the disk: restart it when a log gets too big.
    if (((Get-Date) - $lastSizeCheck).TotalSeconds -ge 60) {
      $lastSizeCheck = Get-Date
      if ((Get-FileSize $cfLog) -gt $MaxLogBytes -or (Get-FileSize $outLog) -gt $MaxLogBytes) {
        Write-TunnelLog 'log cloudflared terlalu besar, restart cloudflared'
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        $null = $p.WaitForExit(15000)
      }
    }
  }

  Write-TunnelLog "cloudflared exited with code $($p.ExitCode), restarting in 10s"
  Start-Sleep -Seconds 10
}
