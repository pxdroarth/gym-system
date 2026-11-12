@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-versions.ps1" %*
exit /b %errorlevel%
