@echo off
title Restaurant POS — Start Server
echo Starting Restaurant POS Server...
pm2 start restaurant-pos-server 2>nul || (
    echo PM2 not found. Starting directly...
    node "%~dp0index.js"
)
