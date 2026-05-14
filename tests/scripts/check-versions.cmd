@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0check-versions.ps1" %*
