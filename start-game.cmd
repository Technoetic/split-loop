@echo off
cd /d "%~dp0"
node scripts/server.mjs --port 8794
pause
