@echo off
title Sistema Academia - Dev Launcher

echo Iniciando ambiente de desenvolvimento...

cd /d "C:\sistema-academia-main"

echo Abrindo Backend...
start "Backend - Sistema Academia" cmd /k "cd /d %~dp0 && node backend/server.js"

echo Abrindo Frontend...
start "Frontend - Sistema Academia" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Ambiente iniciado.
exit