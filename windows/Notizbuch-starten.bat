@echo off
chcp 65001 >nul
setlocal
title Notizbuch-Server
call "%~dp0hilfe\umgebung.cmd"

:pruefen
rem ---- Node.js vorhanden? ----
where node >nul 2>nul
if errorlevel 1 goto keinnode
node -e "process.exit(+process.versions.node.split('.')[0]>=18?0:1)"
if errorlevel 1 goto altnode

rem ---- Im Hintergrund (Autostart): ohne Fenster, Meldungen in eine Protokolldatei ----
if /i "%~1"=="dienst" (
  if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
  node "%SERVER_JS%" >> "%DATA_DIR%\server.log" 2>&1
  exit /b
)

rem ---- Läuft das Notizbuch schon (z. B. über den Autostart)? Dann nur den Browser öffnen ----
powershell -NoProfile -Command "try{Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:%PORT%/api/status | Out-Null; exit 0}catch{exit 1}" >nul 2>nul
if not errorlevel 1 (
  echo Das Notizbuch läuft schon im Hintergrund.
  echo Es öffnet sich jetzt im Browser: http://localhost:%PORT%
  start "" "http://localhost:%PORT%"
  timeout /t 6 >nul
  exit /b
)

rem ---- Beim allerersten Start: eigenen Zugang anlegen ----
if not exist "%DATA_DIR%\users.json" (
  node "%SERVER_JS%" einrichten
  if errorlevel 1 goto fehler
)

echo.
echo ================================================================
echo   Das Notizbuch läuft. DIESES FENSTER BITTE OFFEN LASSEN.
echo   Wenn du es schließt, ist das Notizbuch für alle aus.
echo   (Tipp: Mit "Autostart-einrichten" läuft es unsichtbar
echo    im Hintergrund und startet mit dem PC.)
echo ================================================================
echo.
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%"
node "%SERVER_JS%"
echo.
echo Das Notizbuch wurde beendet.
pause
exit /b

:keinnode
echo.
echo Für das Notizbuch fehlt noch das kostenlose Programm "Node.js".
where winget >nul 2>nul
if errorlevel 1 goto nodeseite
choice /C JN /M "Soll Node.js jetzt automatisch installiert werden (J = ja, N = nein)"
if errorlevel 2 goto nodeseite
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
if exist "%ProgramFiles%\nodejs\node.exe" (
  echo.
  echo Node.js ist installiert. Es geht weiter ...
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  goto pruefen
)
:nodeseite
echo.
echo Bitte Node.js von der Webseite installieren (Knopf "LTS" bzw. "Windows Installer"),
echo dabei immer auf "Weiter" klicken. Danach diese Datei noch einmal doppelklicken.
start "" "https://nodejs.org/de/download"
pause
exit /b

:altnode
echo Die installierte Node.js-Version ist zu alt. Bitte die aktuelle LTS-Version von https://nodejs.org installieren.
start "" "https://nodejs.org/de/download"
pause
exit /b

:fehler
echo.
echo Etwas ist schiefgegangen. Bitte die Meldung oben lesen.
pause
exit /b 1
