@echo off
chcp 65001 >nul
setlocal
title Notizbuch: Sicherung
call "%~dp0hilfe\umgebung.cmd"
where node >nul 2>nul || (echo Node.js fehlt. Bitte zuerst "Notizbuch-starten" doppelklicken. & pause & exit /b 1)
echo Das Notizbuch macht jeden Tag von selbst eine Sicherung.
echo Hier wird sofort eine zusätzliche erstellt ...
echo.
node "%SERVER_JS%" sicherung
echo.
echo Alle Sicherungen liegen in: %BACKUP_DIR%
start "" "%BACKUP_DIR%"
pause
