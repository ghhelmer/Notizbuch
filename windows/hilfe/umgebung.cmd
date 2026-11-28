@rem Gemeinsame Einstellungen fuer alle Notizbuch-Dateien in diesem Ordner.
@rem Bitte hier nichts aendern. Eigene Werte gehoeren in ..\einstellungen.cmd (wird beim ersten Start angelegt).
for %%I in ("%~dp0..\..") do set "APP_DIR=%%~fI"
set "EINSTELLUNGEN=%~dp0..\einstellungen.cmd"
if exist "%EINSTELLUNGEN%" call "%EINSTELLUNGEN%"
if not defined DATA_DIR set "DATA_DIR=%USERPROFILE%\Notizbuch-Daten"
if not defined BACKUP_DIR set "BACKUP_DIR=%USERPROFILE%\Notizbuch-Sicherungen"
if not defined PORT set "PORT=8080"
if not defined BACKUP_KEEP set "BACKUP_KEEP=30"
set "HOST=0.0.0.0"
set "SERVER_JS=%APP_DIR%\server\server.js"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%EINSTELLUNGEN%" goto :eof
> "%EINSTELLUNGEN%" (
  echo @rem Einstellungen fuer das Notizbuch. Nach einer Aenderung den PC neu starten.
  echo @rem DATA_DIR    = Ordner mit allen Notizen, Terminen und Benutzern
  echo @rem BACKUP_DIR  = Ordner fuer die taegliche Sicherung. Tipp: ein Ordner in OneDrive oder auf einem USB-Laufwerk
  echo @rem BACKUP_KEEP = so viele taegliche Sicherungen bleiben erhalten
  echo @rem PORT        = Anschlussnummer im Heimnetz, normalerweise 8080
  echo set "DATA_DIR=%DATA_DIR%"
  echo set "BACKUP_DIR=%BACKUP_DIR%"
  echo set "BACKUP_KEEP=%BACKUP_KEEP%"
  echo set "PORT=%PORT%"
)
