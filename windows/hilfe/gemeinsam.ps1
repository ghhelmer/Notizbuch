# Gemeinsame Hilfen für autostart.ps1 und aktualisieren.ps1
$ErrorActionPreference = 'Stop'
$Hilfe = Split-Path -Parent $PSCommandPath
$Win   = Split-Path -Parent $Hilfe
$App   = Split-Path -Parent $Win
$Bat   = Join-Path $Win 'Notizbuch-starten.bat'
$Einst = Join-Path $Win 'einstellungen.cmd'

function Ende([int]$code = 0) { Write-Host ''; Read-Host 'Zum Schließen Enter drücken' | Out-Null; exit $code }

function Als-Admin([string]$skript) {
  $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$skript`"")
    exit
  }
}

function Lies-Einstellungen {
  $cfg = @{ PORT = '8080' }
  if (Test-Path $Einst) {
    foreach ($z in Get-Content $Einst) { if ($z -match '^\s*set\s+"([A-Z_]+)=(.*)"\s*$') { $cfg[$matches[1]] = $matches[2] } }
  }
  return $cfg
}

function Laeuft([string]$port) {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://localhost:$port/api/status" | Out-Null; return $true } catch { return $false }
}

function Stoppe-Notizbuch([string]$port) {
  Stop-ScheduledTask -TaskName 'Notizbuch' -ErrorAction SilentlyContinue
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
}

function Zeige-Adressen([string]$port) {
  Write-Host ''
  Write-Host 'So öffnest du das Notizbuch:' -ForegroundColor Cyan
  Write-Host "  auf diesem PC:        http://localhost:$port"
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -notlike '100.*' } |
    ForEach-Object { Write-Host "  im Heimnetz (WLAN):   http://$($_.IPAddress):$port" }
}
