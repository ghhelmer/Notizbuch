# Richtet ein, dass das Notizbuch unsichtbar im Hintergrund läuft und mit dem PC startet
# (auch wenn sich niemand anmeldet, z. B. nach einem Windows-Update).
. (Join-Path (Split-Path -Parent $PSCommandPath) 'gemeinsam.ps1')
Als-Admin $PSCommandPath
$Host.UI.RawUI.WindowTitle = 'Notizbuch: Autostart'

if (-not (Test-Path $Einst) -or -not (Test-Path $Bat)) {
  Write-Host 'Bitte zuerst einmal "Notizbuch-starten" doppelklicken und deinen Zugang anlegen.' -ForegroundColor Yellow
  Write-Host 'Danach das Fenster schließen und diese Datei noch einmal starten.'
  Ende 1
}
$cfg = Lies-Einstellungen
$port = $cfg.PORT

Write-Host ''
Write-Host 'Was möchtest du tun?' -ForegroundColor Cyan
Write-Host '  1 = Autostart einrichten (empfohlen): Notizbuch läuft unsichtbar und startet mit dem PC'
Write-Host '  2 = Autostart wieder entfernen'
Write-Host '  3 = Notizbuch im Hintergrund jetzt beenden'
$wahl = Read-Host 'Bitte 1, 2 oder 3 eingeben und Enter drücken'

try {
  switch ($wahl) {
    '1' {
      Stoppe-Notizbuch $port
      $action    = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$Bat`" dienst`""
      $trigger   = New-ScheduledTaskTrigger -AtStartup
      $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
      $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
                     -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
      Register-ScheduledTask -TaskName 'Notizbuch' -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
        -Description 'Familien-Notizbuch: Server für Anmeldung und Speicher' -Force | Out-Null

      # Firewall: Zugriff aus dem Heimnetz erlauben (nur in "privaten" Netzwerken)
      Remove-NetFirewallRule -DisplayName 'Notizbuch' -ErrorAction SilentlyContinue
      New-NetFirewallRule -DisplayName 'Notizbuch' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Private | Out-Null

      $oeff = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' })
      foreach ($n in $oeff) {
        Write-Host ''
        Write-Host "Dein Netzwerk ""$($n.Name)"" ist als ÖFFENTLICH eingestellt. Dann kommen Handy und iPad nicht an das Notizbuch." -ForegroundColor Yellow
        $a = Read-Host 'Ist das dein eigenes Heimnetz und soll es auf PRIVAT umgestellt werden? (j/n)'
        if ($a -match '^[jJyY]') { $n | Set-NetConnectionProfile -NetworkCategory Private; Write-Host 'Umgestellt auf Privat.' }
      }

      Start-ScheduledTask -TaskName 'Notizbuch'
      $ok = $false
      for ($i = 0; $i -lt 15 -and -not $ok; $i++) { Start-Sleep -Seconds 1; $ok = Laeuft $port }
      Write-Host ''
      if ($ok) {
        Write-Host 'Fertig! Das Notizbuch läuft jetzt im Hintergrund und startet ab sofort mit dem PC.' -ForegroundColor Green
        Zeige-Adressen $port
      } else {
        Write-Host 'Der Autostart ist eingerichtet, aber das Notizbuch antwortet noch nicht.' -ForegroundColor Yellow
        Write-Host "Hinweise stehen in der Datei: $($cfg.DATA_DIR)\server.log"
      }
    }
    '2' {
      Stoppe-Notizbuch $port
      Unregister-ScheduledTask -TaskName 'Notizbuch' -Confirm:$false -ErrorAction SilentlyContinue
      Remove-NetFirewallRule -DisplayName 'Notizbuch' -ErrorAction SilentlyContinue
      Write-Host 'Autostart entfernt. Zum Starten jetzt wieder "Notizbuch-starten" doppelklicken.' -ForegroundColor Green
    }
    '3' {
      Stoppe-Notizbuch $port
      Write-Host 'Das Notizbuch ist beendet. Beim nächsten PC-Start läuft es wieder (falls der Autostart eingerichtet ist).' -ForegroundColor Green
    }
    default { Write-Host 'Nichts geändert.' }
  }
} catch {
  Write-Host ''
  Write-Host ('Fehler: ' + $_.Exception.Message) -ForegroundColor Red
  Ende 1
}
Ende
