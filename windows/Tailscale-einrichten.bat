@echo off
chcp 65001 >nul
setlocal
title Notizbuch: Zugriff von unterwegs (Tailscale)
call "%~dp0hilfe\umgebung.cmd"
set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
if exist "%TS%" goto da
echo Tailscale ist auf diesem PC noch nicht installiert.
where winget >nul 2>nul
if errorlevel 1 goto seite
choice /C JN /M "Soll Tailscale jetzt automatisch installiert werden (J = ja, N = nein)"
if errorlevel 2 goto seite
winget install -e --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements
if exist "%TS%" goto da
:seite
echo Bitte Tailscale von der Webseite installieren und danach diese Datei noch einmal doppelklicken.
start "" "https://tailscale.com/download/windows"
pause
exit /b

:da
"%TS%" status >nul 2>nul
if not errorlevel 1 goto angemeldet
echo.
echo Bitte bei Tailscale anmelden. Es öffnet sich gleich ein Browserfenster.
echo Tipp: Melde dich mit einem Konto an, das du dir gut merken kannst (z. B. Google oder Microsoft).
echo Auf allen Handys und iPads der Familie meldest du dich später mit DEMSELBEN Konto an.
"%TS%" up
"%TS%" status >nul 2>nul
if errorlevel 1 (echo Die Anmeldung hat nicht geklappt. Bitte noch einmal versuchen. & pause & exit /b 1)

:angemeldet
echo.
echo Jetzt bekommt das Notizbuch eine sichere https-Adresse, die nur Geräte in deinem Tailscale-Netz erreichen.
echo Falls unten ein Link zum Freischalten erscheint: Link im Browser öffnen, "Enable" klicken,
echo danach diese Datei noch einmal doppelklicken.
echo.
"%TS%" serve --bg %PORT%
echo.
echo ---------------------------------------------------------------
"%TS%" serve status
echo ---------------------------------------------------------------
echo.
echo Die Adresse oben, die mit https:// beginnt und auf .ts.net endet, ist die Adresse
echo für alle Geräte. Sie funktioniert zu Hause und unterwegs.
pause
