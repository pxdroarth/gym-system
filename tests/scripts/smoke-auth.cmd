@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0smoke-auth.ps1" %*
