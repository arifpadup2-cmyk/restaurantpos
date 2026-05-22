@echo off
title Restaurant POS — Stop Server
echo Stopping Restaurant POS Server...
pm2 stop restaurant-pos-server 2>nul || taskkill /F /IM node.exe /T 2>nul
echo Done.
pause
