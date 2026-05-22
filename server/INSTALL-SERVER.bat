@echo off
title Restaurant POS — Server Setup
echo.
echo  ============================================================
echo   Restaurant POS — One-Click Server Setup
echo   This will install Node.js, PostgreSQL, and configure
echo   everything needed to run the POS server.
echo  ============================================================
echo.

:: Check admin rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  [!] This script must be run as Administrator.
    echo      Right-click INSTALL-SERVER.bat ^> Run as administrator
    echo.
    pause
    exit /b 1
)

:: Run PowerShell setup script
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-server.ps1" -ScriptDir "%~dp0"
if %errorLevel% neq 0 (
    echo.
    echo  [ERROR] Setup failed. Check messages above.
    echo.
    pause
    exit /b 1
)
pause
