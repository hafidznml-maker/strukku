@echo off
title StrukKu - Local Server
echo Menjalankan server lokal StrukKu di http://localhost:8080 ...
start "" http://localhost:8080
powershell -ExecutionPolicy Bypass -File "%~dp0start-server.ps1" -Port 8080
pause
