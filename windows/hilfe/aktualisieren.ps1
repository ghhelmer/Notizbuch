# Holt die neueste Version des Notizbuchs von GitHub. Notizen, Benutzer und Einstellungen bleiben erhalten.
. (Join-Path (Split-Path -Parent $PSCommandPath) 'gemeinsam.ps1')
Als-Admin $PSCommandPath
$Host.UI.RawUI.WindowTitle = 'Notizbuch: Aktualisieren'
$cfg = Lies-Einstellungen
$port = $cfg.PORT
$tmp = Join-Path $env:TEMP ('notizbuch-update-' + [guid]::NewGuid().ToString('N'))

try {
  Write-Host 'Neueste Version wird heruntergeladen ...' -ForegroundColor Cyan
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $zip = Join-Path $tmp 'neu.zip'
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -UseBasicParsing 'https://github.com/ghhelmer/Notizbuch/archive/refs/heads/main.zip' -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp 'x')
  $src = Get-ChildItem (Join-Path $tmp 'x') -Directory | Select-Object -First 1
  if (-not $src -or -not (Test-Path (Join-Path $src.FullName 'server\server.js'))) { throw 'Die heruntergeladene Datei sieht nicht richtig aus.' }

  $warAn = Laeuft $port
  Write-Host 'Notizbuch wird kurz angehalten und erneuert ...' -ForegroundColor Cyan
  Stoppe-Notizbuch $port
  robocopy $src.FullName $App /E /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Kopieren fehlgeschlagen (Code $LASTEXITCODE)." }

  if (Get-ScheduledTask -TaskName 'Notizbuch' -ErrorAction SilentlyContinue) {
    Start-ScheduledTask -TaskName 'Notizbuch'
    $ok = $false
    for ($i = 0; $i -lt 15 -and -not $ok; $i++) { Start-Sleep -Seconds 1; $ok = Laeuft $port }
    if ($ok) { Write-Host 'Fertig! Die neue Version läuft.' -ForegroundColor Green }
    else { Write-Host "Aktualisiert, aber das Notizbuch antwortet noch nicht. Hinweise: $($cfg.DATA_DIR)\server.log" -ForegroundColor Yellow }
  } else {
    Write-Host 'Fertig! Bitte jetzt "Notizbuch-starten" doppelklicken.' -ForegroundColor Green
    if ($warAn) { Write-Host '(Das alte Notizbuch-Fenster wurde dabei geschlossen.)' }
  }
  Write-Host 'Auf Handy und iPad die Seite einmal neu laden, dann ist dort auch alles neu.'
} catch {
  Write-Host ''
  Write-Host ('Fehler: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'Es wurde nichts an deinen Notizen geändert.'
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  Ende 1
}
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Ende
