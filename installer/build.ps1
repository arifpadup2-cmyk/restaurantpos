# Restaurant POS Installer Build Script
# Downloads dependencies and builds the Windows installer

param(
    [switch]$SkipDownload,
    [switch]$SkipBuild
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DepsDir = Join-Path $ScriptDir "deps"

Write-Host "Building Restaurant POS Installer..." -ForegroundColor Cyan

if (-not (Test-Path $DepsDir)) {
    New-Item -ItemType Directory -Force -Path $DepsDir | Out-Null
}

# Install npm dependencies
if (-not $SkipBuild) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    Set-Location $ScriptDir
    npm install

    if ($LASTEXITCODE -ne 0) {
        Write-Host "npm install failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "Dependencies installed" -ForegroundColor Green
}

# Build with electron-builder
if (-not $SkipBuild) {
    Write-Host "Building installer..." -ForegroundColor Yellow
    npm run build

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Build complete!" -ForegroundColor Green
        Write-Host "Installer: $ScriptDir\dist\Restaurant POS Installer.exe" -ForegroundColor Cyan
    } else {
        Write-Host "Build failed" -ForegroundColor Red
        exit 1
    }
}
