@echo off
title Restaurant POS — Server Status
echo.
echo Checking server status...
echo.
pm2 list 2>nul
echo.
curl -s http://localhost:3001/health
echo.
pause
