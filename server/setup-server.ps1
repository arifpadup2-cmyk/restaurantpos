#Requires -RunAsAdministrator
param([string]$ScriptDir = $PSScriptRoot)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'   # faster downloads

# ── Colours ───────────────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n  [*] $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  [XX] $msg" -ForegroundColor Red; exit 1 }
function Write-Info  { param($msg) Write-Host "       $msg" -ForegroundColor Gray }

# ── Config ────────────────────────────────────────────────────────────────────
$PG_VERSION   = '16'
$PG_PORT      = 5432
$NODE_MIN_VER = 18
$SERVER_PORT  = 3001
$DB_NAME      = 'restaurant_pos_central'
$DB_USER      = 'pos_central_user'

# Generate secure random passwords/keys if .env doesn't exist yet
$envPath = Join-Path $ScriptDir '.env'
$existingEnv = @{}
if (Test-Path $envPath) {
    Get-Content $envPath | Where-Object { $_ -match '=' } | ForEach-Object {
        $parts = $_ -split '=', 2
        $existingEnv[$parts[0].Trim()] = $parts[1].Trim()
    }
}
function GenSecret { -join ((65..90)+(97..122)+(48..57) | Get-Random -Count 32 | ForEach-Object { [char]$_ }) }

$DB_PASS   = if ($existingEnv['DB_PASS'])   { $existingEnv['DB_PASS'] }   else { "PosDB_$(GenSecret | Select-Object -First 1)$(Get-Random -Min 1000 -Max 9999)" }
$API_KEY   = if ($existingEnv['API_KEY'])   { $existingEnv['API_KEY'] }   else { "pos-api-$(GenSecret)" }
$JWT_SECRET= if ($existingEnv['JWT_SECRET']){ $existingEnv['JWT_SECRET'] } else { "jwt-$(GenSecret)" }

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Magenta
Write-Host "   Restaurant POS — Server Setup v2.0" -ForegroundColor Magenta
Write-Host "  ============================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  You will need:" -ForegroundColor Yellow
Write-Host "    - Restaurant ID  (e.g. REST-AB3X9K)    - from your provider" -ForegroundColor Yellow
Write-Host "    - License Key    (e.g. ABCDE-12345-...) - from your provider" -ForegroundColor Yellow
Write-Host ""

# Prompt for Restaurant ID + License Key
$RESTAURANT_ID = ''
$LICENSE_KEY   = ''

while ($RESTAURANT_ID -notmatch '^REST-[A-Z0-9]{6}$') {
    $RESTAURANT_ID = (Read-Host "  Enter Restaurant ID (e.g. REST-AB3X9K)").ToUpper().Trim()
    if ($RESTAURANT_ID -notmatch '^REST-[A-Z0-9]{6}$') {
        Write-Host "  [!] Invalid format. Must be REST- followed by 6 characters (e.g. REST-AB3X9K)" -ForegroundColor Red
    }
}

while ($LICENSE_KEY.Length -lt 23) {
    $LICENSE_KEY = (Read-Host "  Enter License Key (e.g. ABCDE-12345-FGHIJ-67890)").ToUpper().Trim()
    if ($LICENSE_KEY.Length -lt 23) {
        Write-Host "  [!] License key too short. Check and try again." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "  Restaurant ID: $RESTAURANT_ID" -ForegroundColor Cyan
Write-Host "  License Key:   $($LICENSE_KEY.Substring(0,5))…" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Detect LAN IP ─────────────────────────────────────────────────────
Write-Step "Detecting server LAN IP..."
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254\.' } |
    Select-Object -First 1).IPAddress
if (-not $lanIp) { $lanIp = '127.0.0.1' }
Write-OK "Server IP: $lanIp"

# ── Step 2: Node.js ───────────────────────────────────────────────────────────
Write-Step "Checking Node.js..."
$nodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
$nodeOk   = $false
if ($nodePath) {
    $nodeVer = (node --version 2>&1) -replace 'v',''
    $nodeMaj = [int]($nodeVer -split '\.')[0]
    if ($nodeMaj -ge $NODE_MIN_VER) {
        Write-OK "Node.js v$nodeVer already installed"
        $nodeOk = $true
    } else {
        Write-Warn "Node.js v$nodeVer is too old (need v$NODE_MIN_VER+). Will install latest LTS."
    }
}

if (-not $nodeOk) {
    Write-Step "Downloading Node.js LTS..."
    $nodeInstaller = Join-Path $env:TEMP 'node-lts-x64.msi'
    # Fetch latest LTS version from Node.js
    try {
        $releases = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
        $lts      = $releases | Where-Object { $_.lts } | Select-Object -First 1
        $nodeUrl  = "https://nodejs.org/dist/$($lts.version)/node-$($lts.version)-x64.msi"
        Write-Info "Downloading Node.js $($lts.version)..."
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing
        Write-Info "Installing Node.js (silent)..."
        Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /qn /norestart" -Wait
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
        Write-OK "Node.js installed: $(node --version)"
    } catch {
        Write-Fail "Node.js download failed: $_`n  Install manually from https://nodejs.org/ then re-run this script."
    }
}

# ── Step 3: PostgreSQL ────────────────────────────────────────────────────────
Write-Step "Checking PostgreSQL..."
$pgBin = $null
foreach ($v in @('18','17','16','15','14')) {
    $path = "C:\Program Files\PostgreSQL\$v\bin"
    if (Test-Path "$path\psql.exe") { $pgBin = $path; break }
}
# Also check PATH
if (-not $pgBin) {
    $psqlCmd = (Get-Command psql -ErrorAction SilentlyContinue)?.Source
    if ($psqlCmd) { $pgBin = Split-Path $psqlCmd }
}

if ($pgBin) {
    Write-OK "PostgreSQL found: $pgBin"
} else {
    Write-Step "PostgreSQL not found. Downloading installer..."
    Write-Warn "This download is ~300MB and may take a few minutes."
    $pgInstaller = Join-Path $env:TEMP "postgresql-installer.exe"
    # EDB official silent installer
    $pgUrl = "https://get.enterprisedb.com/postgresql/postgresql-$PG_VERSION.3-1-windows-x64.exe"
    try {
        Write-Info "Downloading from $pgUrl ..."
        Invoke-WebRequest -Uri $pgUrl -OutFile $pgInstaller -UseBasicParsing
        Write-Info "Installing PostgreSQL $PG_VERSION (silent)..."
        $pgSuperPass = $DB_PASS + "Super"
        Start-Process $pgInstaller -ArgumentList (
            "--mode unattended",
            "--superpassword `"$pgSuperPass`"",
            "--servicename postgresql-$PG_VERSION",
            "--servicepassword `"$pgSuperPass`"",
            "--serverport $PG_PORT",
            "--prefix `"C:\Program Files\PostgreSQL\$PG_VERSION`"",
            "--datadir `"C:\Program Files\PostgreSQL\$PG_VERSION\data`""
        ) -Wait
        $pgBin = "C:\Program Files\PostgreSQL\$PG_VERSION\bin"
        $env:Path += ";$pgBin"
        Write-OK "PostgreSQL $PG_VERSION installed."
    } catch {
        Write-Fail "PostgreSQL download failed: $_`n  Download from https://www.postgresql.org/download/windows/ then re-run."
    }
}

# Add pgBin to PATH for this session
if ($pgBin -and $env:Path -notlike "*$pgBin*") {
    $env:Path += ";$pgBin"
}

# Ensure PostgreSQL service is running
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pgService) {
    if ($pgService.Status -ne 'Running') {
        Write-Step "Starting PostgreSQL service..."
        Start-Service $pgService.Name
        Start-Sleep 3
    }
    Write-OK "PostgreSQL service running: $($pgService.Name)"
} else {
    Write-Warn "Could not find PostgreSQL Windows service. Ensure it started after install."
}

# ── Step 4: Create DB + User ─────────────────────────────────────────────────
Write-Step "Setting up database '$DB_NAME' and user '$DB_USER'..."

function Invoke-Psql {
    param([string]$Sql, [string]$Db = 'postgres')
    $env:PGPASSWORD = '' # use peer/trust for superuser on localhost
    $result = & "$pgBin\psql.exe" -U postgres -d $Db -c $Sql 2>&1
    return $result
}

function Invoke-PsqlFile {
    param([string]$File, [string]$Db = 'postgres')
    $env:PGPASSWORD = ''
    $result = & "$pgBin\psql.exe" -U postgres -d $Db -f $File 2>&1
    return $result
}

# Check if user exists
$userCheck = Invoke-Psql "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER';"
if ($userCheck -notmatch '1 row') {
    $r = Invoke-Psql "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
    Write-Info "User created: $r"
} else {
    # Update password in case it changed
    Invoke-Psql "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';" | Out-Null
    Write-Info "User exists — password updated."
}

# Check if database exists
$dbCheck = Invoke-Psql "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';"
if ($dbCheck -notmatch '1 row') {
    $r = Invoke-Psql "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    Write-Info "Database created: $r"
} else {
    Write-Info "Database already exists."
}

# Grant privileges
Invoke-Psql "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" | Out-Null
Invoke-Psql "ALTER DATABASE $DB_NAME OWNER TO $DB_USER;"              | Out-Null

# Grant schema privileges (for PostgreSQL 15+)
$env:PGPASSWORD = ''
& "$pgBin\psql.exe" -U postgres -d $DB_NAME -c "GRANT ALL ON SCHEMA public TO $DB_USER; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;" 2>&1 | Out-Null

Write-OK "Database and user configured."

# ── Step 5: Configure pg_hba.conf for LAN ────────────────────────────────────
Write-Step "Configuring PostgreSQL for LAN access..."
$pgData = $null
foreach ($v in @('18','17','16','15','14')) {
    $path = "C:\Program Files\PostgreSQL\$v\data\pg_hba.conf"
    if (Test-Path $path) { $pgData = "C:\Program Files\PostgreSQL\$v\data"; break }
}
# Also try via service
if (-not $pgData) {
    $pgService2 = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pgService2) {
        $pgDataEnv = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$($pgService2.Name)" -ErrorAction SilentlyContinue)?.ImagePath
        if ($pgDataEnv -match '-D\s+"?([^"]+)"?') { $pgData = $matches[1].Trim() }
    }
}

if ($pgData -and (Test-Path "$pgData\pg_hba.conf")) {
    $hbaPath  = "$pgData\pg_hba.conf"
    $hbaLines = Get-Content $hbaPath

    # Derive LAN subnet from server IP (e.g. 192.168.1.5 → 192.168.1.0/24)
    $subnet = ($lanIp -replace '\.\d+$', '.0') + '/24'
    $lanRule = "host    $DB_NAME    $DB_USER    $subnet    md5"
    $locRule = "host    $DB_NAME    $DB_USER    127.0.0.1/32    md5"

    $changed = $false
    if ($hbaLines -notmatch [regex]::Escape($lanRule)) {
        Add-Content $hbaPath "`n# Restaurant POS — LAN access"
        Add-Content $hbaPath $locRule
        Add-Content $hbaPath $lanRule
        $changed = $true
    }

    if ($changed) {
        # Reload PostgreSQL to apply hba changes
        & "$pgBin\pg_ctl.exe" reload -D "`"$pgData`"" 2>&1 | Out-Null
        Write-OK "pg_hba.conf updated — LAN subnet $subnet allowed."
    } else {
        Write-OK "pg_hba.conf already configured for LAN."
    }
} else {
    Write-Warn "Could not locate pg_hba.conf. LAN connections may need manual config."
    Write-Info "Add this line to pg_hba.conf manually:"
    $subnet = ($lanIp -replace '\.\d+$', '.0') + '/24'
    Write-Info "  host  $DB_NAME  $DB_USER  $subnet  md5"
}

# Test DB connection with pos user
Write-Step "Testing database connection as $DB_USER..."
$env:PGPASSWORD = $DB_PASS
$connTest = & "$pgBin\psql.exe" -U $DB_USER -d $DB_NAME -h 127.0.0.1 -c "SELECT 'ok';" 2>&1
$env:PGPASSWORD = ''
if ($connTest -match 'ok') {
    Write-OK "Database connection verified."
} else {
    Write-Warn "Connection test output: $connTest"
    Write-Warn "Check pg_hba.conf if POS terminals cannot connect."
}

# ── Step 6: Install npm dependencies ─────────────────────────────────────────
Write-Step "Installing server dependencies (npm install)..."
Push-Location $ScriptDir
try {
    $npmOut = npm install --prefer-offline 2>&1
    if ($LASTEXITCODE -ne 0) { throw $npmOut }
    Write-OK "npm packages installed."
} catch {
    Write-Fail "npm install failed: $_"
} finally {
    Pop-Location
}

# ── Step 7: Write .env ────────────────────────────────────────────────────────
Write-Step "Writing .env configuration..."
$envContent = @"
# ─── Central PostgreSQL ──────────────────────────────────────────────────────
DB_HOST=127.0.0.1
DB_PORT=$PG_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASS=$DB_PASS

# ─── Server ──────────────────────────────────────────────────────────────────
PORT=$SERVER_PORT
API_KEY=$API_KEY

# ─── JWT ─────────────────────────────────────────────────────────────────────
JWT_SECRET=$JWT_SECRET

# ─── App ─────────────────────────────────────────────────────────────────────
NODE_ENV=production
"@
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-OK ".env written."

# ── Step 8: Install PM2 + Windows service ────────────────────────────────────
Write-Step "Setting up PM2 process manager (auto-restart on crash + boot)..."
$pm2 = (Get-Command pm2 -ErrorAction SilentlyContinue)?.Source
if (-not $pm2) {
    Write-Info "Installing pm2 globally..."
    npm install -g pm2 2>&1 | Out-Null
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
    $pm2 = (Get-Command pm2 -ErrorAction SilentlyContinue)?.Source
}

if ($pm2) {
    Write-Info "Installing pm2-windows-startup..."
    npm install -g pm2-windows-startup 2>&1 | Out-Null

    # Write ecosystem file
    $ecoPath = Join-Path $ScriptDir 'ecosystem.config.js'
    $ecoContent = @"
module.exports = {
  apps: [{
    name:        'restaurant-pos-server',
    script:      'index.js',
    cwd:         '$($ScriptDir.Replace('\','\\'))',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '512M',
    env: { NODE_ENV: 'production' },
    error_file:  '$($ScriptDir.Replace('\','\\'))\\logs\\err.log',
    out_file:    '$($ScriptDir.Replace('\','\\'))\\logs\\out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
}
"@
    Set-Content -Path $ecoPath -Value $ecoContent -Encoding UTF8

    # Create logs folder
    New-Item -ItemType Directory -Force "$ScriptDir\logs" | Out-Null

    # Stop old instance if running
    & pm2 stop restaurant-pos-server 2>&1 | Out-Null
    & pm2 delete restaurant-pos-server 2>&1 | Out-Null

    # Start with pm2
    Push-Location $ScriptDir
    & pm2 start ecosystem.config.js 2>&1 | Out-Null
    Start-Sleep 3

    # Save pm2 list
    & pm2 save 2>&1 | Out-Null

    # Install Windows startup (auto-start on boot)
    & pm2-startup install 2>&1 | Out-Null

    Pop-Location
    Write-OK "PM2 configured — server will auto-start on boot and auto-restart on crash."
} else {
    Write-Warn "PM2 not available. Server will not auto-start. Start manually: node index.js"
}

# ── Step 9: Windows Firewall ─────────────────────────────────────────────────
Write-Step "Configuring Windows Firewall..."
$rules = @(
    @{ Name='Restaurant POS API'; Port=$SERVER_PORT; Proto='TCP' },
    @{ Name='Restaurant POS DB';  Port=$PG_PORT;     Proto='TCP' }
)
foreach ($rule in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Info "Firewall rule already exists: $($rule.Name)"
    } else {
        New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound `
            -Protocol $rule.Proto -LocalPort $rule.Port -Action Allow | Out-Null
        Write-OK "Firewall rule added: $($rule.Name) (port $($rule.Port))"
    }
}

# ── Step 10: Wait for server + health check ───────────────────────────────────
Write-Step "Waiting for server to start..."
$healthOk = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep 2
    try {
        $resp = Invoke-RestMethod "http://127.0.0.1:$SERVER_PORT/health" -TimeoutSec 3
        if ($resp.ok) { $healthOk = $true; break }
    } catch {}
    Write-Info "Waiting... ($($i*2)s)"
}

if ($healthOk) {
    Write-OK "Server is running — health check passed!"
} else {
    Write-Warn "Server did not respond in 30s. Check logs at $ScriptDir\logs\err.log"
}

# ── Step 11: Create back office admin user ────────────────────────────────────
if ($healthOk) {
    Write-Step "Creating default Back Office admin account..."
    try {
        $body = '{"username":"admin","password":"Admin@1234"}'
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:$SERVER_PORT/auth/register" `
            -Method POST -Body $body -ContentType 'application/json' -TimeoutSec 5
        if ($resp.ok) {
            Write-OK "Back Office admin created: admin / Admin@1234"
            Write-Warn "IMPORTANT: Change this password immediately after first login!"
        }
    } catch {
        Write-Info "Admin account may already exist — skipping."
    }
}

# ── Step 12: Register restaurant license ─────────────────────────────────────
if ($healthOk) {
    Write-Step "Registering restaurant license on this server..."
    try {
        # Login to get JWT token
        $loginBody = '{"username":"admin","password":"Admin@1234"}'
        $loginResp = Invoke-RestMethod -Uri "http://127.0.0.1:$SERVER_PORT/auth/login" `
            -Method POST -Body $loginBody -ContentType 'application/json' -TimeoutSec 5
        $JWT = $loginResp.token

        if ($JWT) {
            # Check if restaurant already registered
            $existResp = Invoke-RestMethod -Uri "http://127.0.0.1:$SERVER_PORT/setup/restaurants" `
                -Headers @{ Authorization = "Bearer $JWT" } -TimeoutSec 5
            $alreadyExists = $existResp.restaurants | Where-Object { $_.id -eq $RESTAURANT_ID }

            if ($alreadyExists) {
                Write-OK "Restaurant $RESTAURANT_ID already registered on this server."
            } else {
                Write-Warn "Restaurant $RESTAURANT_ID not found. It will be validated when first terminal connects."
                Write-Info "If this is a fresh install, the provider must register the restaurant in their Back Office first."
            }
        }
    } catch {
        Write-Info "Could not verify license online — terminals will validate on first connect."
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   SETUP COMPLETE!" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Server IP (share with technicians):  " -NoNewline; Write-Host $lanIp -ForegroundColor Yellow
Write-Host "  API Port:                             " -NoNewline; Write-Host $SERVER_PORT -ForegroundColor Yellow
Write-Host "  Database:                             " -NoNewline; Write-Host $DB_NAME -ForegroundColor Yellow
Write-Host "  DB User:                              " -NoNewline; Write-Host $DB_USER -ForegroundColor Yellow
Write-Host "  DB Password:                          " -NoNewline; Write-Host $DB_PASS -ForegroundColor Yellow
Write-Host "  API Key:                              " -NoNewline; Write-Host $API_KEY -ForegroundColor Yellow
Write-Host ""
Write-Host "  Back Office URL:  http://$lanIp`:$SERVER_PORT/backoffice/" -ForegroundColor Cyan
Write-Host "  Waiter App URL:   http://$lanIp`:$SERVER_PORT/waiter-app/" -ForegroundColor Cyan
Write-Host "  Kitchen Display:  http://$lanIp`:$SERVER_PORT/kds/" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Back Office login:  admin / Admin@1234  (CHANGE THIS!)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  POS Terminal Setup:" -ForegroundColor White
Write-Host "  1. Copy 'Restaurant POS Setup 2.0.0.exe' to client PC" -ForegroundColor White
Write-Host "  2. Install and enter this server IP: $lanIp" -ForegroundColor White
Write-Host "  3. Machine ID: POS-01, POS-02, WAITER-01 etc." -ForegroundColor White
Write-Host "  4. Advanced > DB Password: $DB_PASS" -ForegroundColor White
Write-Host ""
Write-Host "  SAVE THESE DETAILS — you will need them for terminal setup!" -ForegroundColor Magenta
Write-Host ""

# Save setup summary to file
$summaryPath = Join-Path $ScriptDir 'SETUP-SUMMARY.txt'
@"
Restaurant POS — Setup Summary
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
===============================================
RESTAURANT ID:  $RESTAURANT_ID
LICENSE KEY:    $LICENSE_KEY

Server IP:    $lanIp
API Port:     $SERVER_PORT
Database:     $DB_NAME

Web URLs:
  Back Office:  http://${lanIp}:${SERVER_PORT}/backoffice/
  Waiter App:   http://${lanIp}:${SERVER_PORT}/waiter-app/
  Kitchen (KDS):http://${lanIp}:${SERVER_PORT}/kds/

Back Office Login: admin / Admin@1234  (CHANGE THIS!)

POS Terminal Setup (enter these when first launching POS):
  Server IP:      $lanIp
  Restaurant ID:  $RESTAURANT_ID
  License Key:    $LICENSE_KEY
  Terminal Names: POS-01, POS-02, WAITER-01, WAITER-02 ...

[Advanced/IT use only]
  DB User:      $DB_USER
  DB Password:  $DB_PASS
  API Key:      $API_KEY
"@ | Set-Content $summaryPath -Encoding UTF8

Write-Host "  Setup summary saved to: SETUP-SUMMARY.txt" -ForegroundColor Green
Write-Host ""
