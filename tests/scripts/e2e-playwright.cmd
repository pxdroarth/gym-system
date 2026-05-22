@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0e2e-playwright.ps1" %*
