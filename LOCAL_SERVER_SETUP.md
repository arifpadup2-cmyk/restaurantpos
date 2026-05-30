# LOCAL Server Setup Guide - Restaurant POS Dual-Mode

This guide explains how to set up the Express server on your local restaurant network to enable dual-mode (LOCAL + CLOUD with auto-failover).

## Prerequisites

- ✅ PostgreSQL 16+ installed on local server PC
- ✅ Node.js 18+ installed
- ✅ Windows/macOS/Linux local network access
- ✅ Port 3001 available on local server
- ✅ Neon Cloud database configured (restaurantpos-8xew.onrender.com)

## Step 1: Database Setup

### 1.1 Create PostgreSQL User
```powershell
# Open PowerShell as Administrator
psql -U postgres -c "CREATE USER pos_central_user WITH PASSWORD 'pos_secure_2024!';"
```

### 1.2 Create Central Database
```powershell
psql -U postgres -c "CREATE DATABASE restaurant_pos_central OWNER pos_central_user;"
psql -U postgres -d restaurant_pos_central -c "GRANT ALL PRIVILEGES ON DATABASE restaurant_pos_central TO pos_central_user;"
```

### 1.3 Verify Connection
```powershell
psql -U pos_central_user -d restaurant_pos_central -c "SELECT version();"
```

Should return: `PostgreSQL 16.x on ...`

## Step 2: Express Server Configuration

### 2.1 Navigate to Server Directory
```powershell
cd C:\Users\Lenovo\AppData\Local\Temp\restaurantpos\server
```

### 2.2 Create .env File
Create `server/.env`:
```
# ─── Database (Local PostgreSQL) ──────────────────────────────────────
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=restaurant_pos_central
DB_USER=pos_central_user
DB_PASS=pos_secure_2024!

# ─── Server ──────────────────────────────────────────────────────────
PORT=3001
NODE_ENV=development

# ─── Auth ────────────────────────────────────────────────────────────
JWT_SECRET=local-server-jwt-secret-change-in-production-2026
API_KEY=pos-api-key-2026

# ─── Admin Account ───────────────────────────────────────────────────
ADMIN_USERNAME=arifpadup
ADMIN_PASSWORD=LocalAdmin@2026
ADMIN_NAME=Local Admin

# ─── Encryption (Must be exactly 32 characters) ──────────────────────
ENCRYPTION_KEY=local-encryption-key-32chars!!

# ─── Cloud Sync Configuration ────────────────────────────────────────
IS_CLOUD_SERVER=false
CLOUD_SYNC_URL=https://restaurantpos-8xew.onrender.com
CLOUD_SYNC_KEY=pos-api-key-2026
CLOUD_BRAND_ID=REST-GPPE8G

# ─── Data Directory ──────────────────────────────────────────────────
DATA_DIR=./backups
```

### 2.3 Install Dependencies
```powershell
npm install
# Installs: express, cors, postgres, socket.io, dotenv, node-thermal-printer, etc.
```

### 2.4 Initialize Database (Migrations)
The server will automatically run migrations on first start. To verify:
```powershell
npm start
# Watch for: "Database initialized", "Migrations completed", "Server running on port 3001"
```

### 2.5 Test Server Health
```powershell
# In another PowerShell window:
curl http://127.0.0.1:3001/health

# Should return: 200 OK
```

## Step 3: Back Office Access (Optional - via LOCAL server)

If you want to run Back Office from LOCAL server:
```powershell
# Access at: http://127.0.0.1:3001/backoffice
# Credentials: arifpadup / LocalAdmin@2026
```

Otherwise, use CLOUD Back Office:
```
https://restaurantpos-8xew.onrender.com
Credentials: chillzoneice218 / PWDPU782!
```

## Step 4: POS App Configuration

### 4.1 Create LOCAL POS Config
File: `C:\Users\Lenovo\AppData\Roaming\restaurant-pos\pos-config.json`

```json
{
  "serverMode": "LOCAL",
  "localUrl": "http://127.0.0.1:3001",
  "cloudUrl": "https://restaurantpos-8xew.onrender.com",
  "machineId": "POS-LOCAL-01",
  "outletCode": "YK767P",
  "outletId": "565B10A0AD",
  "outletName": "Fresh Test Outlet",
  "brandId": "REST-GPPE8G",
  "apiKey": "pos-api-key-2026",
  "dbHost": "127.0.0.1",
  "dbPort": "5432",
  "dbName": "restaurant_pos_central",
  "dbUser": "pos_central_user",
  "dbPass": "pos_secure_2024!",
  "autoFailoverThreshold": 3,
  "failoverAttempts": 0,
  "lastSyncTime": 0,
  "syncInterval": 60000
}
```

### 4.2 Create/Update POS Outlet Database

The POS app will create a per-outlet database. If needed manually:
```powershell
# Create outlet-specific database
psql -U pos_central_user -d restaurant_pos_central -c "
  CREATE DATABASE pos_outlet_565b10a0ad;
  GRANT ALL PRIVILEGES ON DATABASE pos_outlet_565b10a0ad TO pos_central_user;
"
```

### 4.3 Test POS Connection

Start POS and verify:
1. Login screen appears
2. Bottom-right corner shows "LOCAL" mode indicator
3. Outlet code matches: YK767P
4. Connection status: ✅ Connected to http://127.0.0.1:3001

## Step 5: Waiter/KDS/Delivery App Configuration

### 5.1 Waiter App
```
Browser: http://127.0.0.1:3001/waiter-app
Outlet Code: YK767P
PIN Login: Use staff PIN (created in Back Office)
```

### 5.2 KDS (Kitchen Display System)
```
Browser: http://127.0.0.1:3001/kds
Outlet Code: YK767P
No login (direct access)
```

### 5.3 Delivery App
```
Browser: http://127.0.0.1:3001/delivery-app
Outlet Code: YK767P
PIN Login: Use delivery boy PIN
```

## Step 6: Test Auto-Failover

### 6.1 Verify LOCAL Mode Works
1. Start Express server: `npm start`
2. Open POS
3. Verify connection: "Connected to LOCAL"
4. Create test order
5. Verify order in database

### 6.2 Test Failover to CLOUD
1. Stop Express server: `Ctrl+C`
2. Watch POS for: "Attempting failover..."
3. After 3 failed attempts: "Switched to CLOUD mode"
4. Verify POS still works (pulls from Neon)
5. Try to create another order (should work, sent to cloud)

### 6.3 Test Recovery to LOCAL
1. Restart Express server: `npm start`
2. Watch POS for: "LOCAL server detected, recovering..."
3. After 1 successful health check: "Switched to LOCAL mode"
4. Verify POS back to LOCAL connection
5. Sync any orders created while in CLOUD mode

## Step 7: Auto-Sync Verification

### 7.1 In CLOUD Back Office
1. Go to Menu → Add new item: "Test Burger"
2. Save item

### 7.2 In LOCAL POS
1. Wait 60 seconds (or less, depending on sync interval)
2. Menu should refresh automatically
3. New item "Test Burger" should appear

### 7.3 Monitor Sync Logs
```powershell
# On Local Server
# Check logs in: server/logs/sync.log
# Should see: "Syncing with cloud...", "Pulled 1 new items", "Local DB updated"
```

## Troubleshooting

### Issue: "FATAL: password authentication failed"
**Solution**:
- Verify PostgreSQL is running: `psql -U postgres -c "SELECT 1"`
- Verify user exists: `psql -U postgres -l | grep restaurant_pos_central`
- Reset password: `psql -U postgres -c "ALTER USER pos_central_user WITH PASSWORD 'pos_secure_2024!';"`

### Issue: "Port 3001 already in use"
**Solution**:
- Change PORT in .env to 3002 or higher
- Or kill process using port: `Get-Process | Where-Object {$_.Name -like "*node*"} | Stop-Process`

### Issue: "Failed to connect to LOCAL server"
**Solution**:
- Verify server running: `curl http://127.0.0.1:3001/health`
- Check firewall: Allow port 3001
- Check network: Apps and server on same network
- Check .env DATABASE_URL or DB_* variables

### Issue: "Sync not working"
**Solution**:
- Verify CLOUD_SYNC_URL: `https://restaurantpos-8xew.onrender.com/health`
- Verify API_KEY matches: pos-api-key-2026
- Check internet connection
- Wait 60 seconds for next sync cycle
- Check server logs: `tail -f server/logs/sync.log`

### Issue: "Apps stuck in CLOUD mode"
**Solution**:
- Verify LOCAL server status: `/health`
- Reset failover counter in pos-config.json: `"failoverAttempts": 0`
- Restart POS app
- Check local network connectivity

## Security Considerations

⚠️ **IMPORTANT**: These are development credentials. For production:

1. Change all passwords:
   - PostgreSQL user password
   - JWT_SECRET (generate random 64-char string)
   - API_KEY (generate random 32-char string)
   - ADMIN_PASSWORD
   - ENCRYPTION_KEY (generate random 32-char string)

2. Network Security:
   - Restrict port 3001 to local network only (firewall)
   - Use VPN/SSL for remote access
   - Implement IP whitelisting for apps

3. Database Security:
   - Enable PostgreSQL WAL archiving for backups
   - Restrict database user privileges (don't use superuser)
   - Enable SSL connections in production

## Performance Optimization

- **Sync Interval**: 60 seconds (configurable in pos-config.json)
- **Health Check**: Every 5 seconds (adjustable in app code)
- **Connection Pool**: 10 connections (server side)
- **Database Indexes**: Auto-created on migration

To optimize for larger outlets:
```sql
-- Monitor slow queries
SELECT query, mean_exec_time FROM pg_stat_statements 
ORDER BY mean_exec_time DESC LIMIT 10;

-- Add indexes for frequently filtered columns
CREATE INDEX idx_orders_outlet ON orders(outlet_id);
CREATE INDEX idx_items_category ON menu_items(category_id);
```

## Next Steps

1. ✅ Run LOCAL server on restaurant PC
2. ✅ Configure all apps to point to LOCAL server
3. ✅ Test failover by stopping LOCAL server
4. ✅ Verify sync works every 60 seconds
5. ✅ Monitor logs for any errors
6. ✅ Train staff on new LOCAL/CLOUD indicator

---

**Status**: Ready for pilot deployment
**Test Outlet**: Fresh Test Outlet (YK767P)
**Contact**: arifpadup@gmail.com
