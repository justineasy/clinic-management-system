@echo off
title ClinicHub
rem Double-click to start ClinicHub. Keep this window open while using the app.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org & pause & exit /b 1)
set OPEN=1
node server.js
echo.
echo ClinicHub stopped. If you see an error above, send a screenshot.
pause
