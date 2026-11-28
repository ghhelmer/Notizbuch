@echo off
chcp 65001 >nul
setlocal
title Notizbuch: Passwort zurücksetzen
call "%~dp0hilfe\umgebung.cmd"
where node >nul 2>nul || (echo Node.js fehlt. Bitte zuerst "Notizbuch-starten" doppelklicken. & pause & exit /b 1)
echo Hier kannst du ein vergessenes Passwort neu setzen.
echo Vorhandene Benutzer:
node "%SERVER_JS%" liste
echo.
node "%SERVER_JS%" passwort
echo.
echo Das neue Passwort gilt sofort, ein Neustart ist nicht nötig.
pause
