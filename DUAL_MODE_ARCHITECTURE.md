# Restaurant POS - Dual-Mode Architecture

## Overview

The Restaurant POS system operates in **dual-mode**: LOCAL and CLOUD, with automatic failover. This ensures restaurants can operate offline while syncing when online.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       RESTAURANT (Local Network)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  LOCAL EXPRESS SERVER (Port 3001)                                      │
│  ├─ PostgreSQL restaurant_pos_central                                  │
│  └─ Database Sync Status: Managed locally                             │
│                                                                         │
│  LOCAL APPS (All use LOCAL server as PRIMARY)                         │
│  ├─ POS (Electron) → 127.0.0.1:3001                                  │
│  ├─ Waiter App (PWA) → 127.0.0.1:3001                               │
│  ├─ KDS (PWA) → 127.0.0.1:3001                                      │
│  └─ Delivery App (PWA) → 127.0.0.1:3001                            │
│                                                                         │
│  AUTO-SYNC (Every 60 seconds)                                         │
│  └─ Pull from CLOUD: Menu items, Staff, Settings, Tables, Printers  │
│                                                                         │
│  AUTO-FAILOVER (If LOCAL server unavailable)                         │
│  └─ Switch all apps to CLOUD mode (restaurantpos-8xew.onrender.com) │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↕
                            (EVERY 60 SECONDS)
                                    ↕
┌─────────────────────────────────────────────────────────────────────────┐
│                            CLOUD (Render)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  CLOUD EXPRESS SERVER @ restaurantpos-8xew.onrender.com              │
│  ├─ Neon PostgreSQL (Source of Truth)                               │
│  ├─ Back Office UI                                                  │
│  └─ Fallback API for all LOCAL apps                                 │
│                                                                         │
│  NEON DATABASE (Primary)                                            │
│  └─ postgresql://neondb_owner:***@ep-wispy-water-alc388ct-pooler   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Connection Modes

### LOCAL Mode (Primary)
- **When**: EXPRESS server at 127.0.0.1:3001 is reachable
- **Database**: Local PostgreSQL (restaurant_pos_central)
- **Apps**: POS, Waiter, KDS, Delivery all connect to local server
- **Sync**: Every 60 seconds, pull updates from CLOUD:
  - Menu items
  - Categories
  - Staff/Cashiers
  - Settings
  - Tables layout
  - Printers
  - Modifiers
- **Offline**: Apps can continue working without internet
- **Orders**: Saved to local database
- **Real-time**: WebSocket via local server

### CLOUD Mode (Fallback)
- **When**: EXPRESS server at 127.0.0.1:3001 is unreachable for 3+ attempts
- **Database**: Neon PostgreSQL (via restaurantpos-8xew.onrender.com)
- **Apps**: All apps switch to cloud connection
- **Sync**: Real-time via CLOUD server
- **Requires**: Active internet connection
- **Orders**: Sent directly to CLOUD server
- **Real-time**: WebSocket via CLOUD server

## Auto-Failover Logic

```javascript
// Pseudo-code for app connection logic
async function getServerUrl() {
  const localUrl = 'http://127.0.0.1:3001'
  const cloudUrl = 'https://restaurantpos-8xew.onrender.com'
  
  try {
    // Try LOCAL first
    const response = await fetch(`${localUrl}/health`, { timeout: 3000 })
    if (response.ok) return localUrl
  } catch (error) {
    // LOCAL failed, increment failover counter
    failoverAttempts++
  }
  
  // If 3+ LOCAL failures, switch to CLOUD
  if (failoverAttempts >= 3) {
    return cloudUrl
  }
  
  // Otherwise, keep trying LOCAL
  return localUrl
}
```

## Auto-Recovery Logic

When LOCAL server comes back online:
1. App detects successful LOCAL connection
2. Reset failover counter
3. Switch back to LOCAL mode
4. Sync any missed updates from CLOUD
5. Resume normal LOCAL operation

## Sync Mechanism (Every 60 seconds)

**LOCAL server syncs with CLOUD:**

```
LOCAL Server              CLOUD Server (Neon)
     ↓                            ↑
  [Data Pull]
     ├─ Menu items
     ├─ Categories
     ├─ Staff/Cashiers
     ├─ Settings
     ├─ Tables layout
     ├─ Printers
     └─ Modifiers
     ↓
[Local PostgreSQL Updated]
     ↓
[Broadcasting via Socket.io to local apps]
```

**Apps get real-time updates via:**
- Socket.io events (local mode)
- WebSocket (cloud mode)
- Pull sync every 60 seconds (fallback)

## Configuration Files

### LOCAL Server (.env)
```
# Local database (restaurant_pos_central)
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=restaurant_pos_central
DB_USER=pos_central_user
DB_PASS=pos_secure_2024!

# Cloud sync settings
CLOUD_SYNC_URL=https://restaurantpos-8xew.onrender.com
CLOUD_SYNC_KEY=pos-api-key-2026
CLOUD_BRAND_ID=REST-GPPE8G

# Server
PORT=3001
NODE_ENV=development
JWT_SECRET=local-server-jwt-secret
API_KEY=pos-api-key-2026
```

### CLOUD Server (.env on Render)
```
# Neon Database (Source of Truth)
DATABASE_URL=postgresql://neondb_owner:npg_58SHzriDLJgd@ep-wispy-water-alc388ct-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

# Server
PORT=3000 (or 10000 on Render)
NODE_ENV=production
JWT_SECRET=cloud-server-jwt-secret
API_KEY=pos-api-key-2026

# Cloud-specific flags
IS_CLOUD_SERVER=true
```

### App Configuration (POS/Waiter/KDS/Delivery)

Each app stores configuration:
```javascript
{
  serverMode: "LOCAL|CLOUD",  // Current mode
  localUrl: "http://127.0.0.1:3001",
  cloudUrl: "https://restaurantpos-8xew.onrender.com",
  machineId: "POS-01",
  outletCode: "YK767P",
  outletId: "565B10A0AD",
  brandId: "REST-GPPE8G",
  apiKey: "pos-api-key-2026",
  lastSyncTime: 1234567890,
  failoverAttempts: 0,
  autoFailoverThreshold: 3
}
```

## Implementation Steps

### Step 1: LOCAL Server Setup
1. ✅ PostgreSQL 16+ installed locally
2. ✅ Create `pos_central_user` with password
3. ✅ Create `restaurant_pos_central` database
4. ✅ Run server migrations
5. ✅ Start Express server on port 3001

### Step 2: CLOUD Server Verification
1. ✅ Render server running at restaurantpos-8xew.onrender.com
2. ✅ Configured to use Neon PostgreSQL
3. ✅ Back Office accessible
4. ✅ API endpoints working

### Step 3: App Configuration
1. Configure each app (POS/Waiter/KDS/Delivery):
   - Set `localUrl` = `http://127.0.0.1:3001`
   - Set `cloudUrl` = `https://restaurantpos-8xew.onrender.com`
   - Set `outletCode` = app-specific (e.g., YK767P for POS)
   - Set `machineId` = device identifier

### Step 4: Auto-Failover Integration
1. All apps implement health check every 5 seconds
2. After 3 failed local attempts, switch to cloud
3. Test failover: Stop local server → verify apps switch to cloud
4. Test recovery: Start local server → verify apps switch back

### Step 5: Sync Integration
1. LOCAL server pulls from CLOUD every 60 seconds
2. Apps listen to Socket.io for real-time updates
3. Apps also perform sync on mode change (LOCAL → CLOUD or vice versa)

## API Endpoints

### Health Check (both servers)
```
GET /health
Response: 200 OK
```

### Config/Setup (both servers)
```
GET /config/brands
GET /config/outlets
GET /setup/by-code
POST /setup/connect-code
```

### Menu Sync
```
POST /api/sync/pull-updates
Body: { outlet_id, brand_id, last_sync_time }
Response: { items, categories, staff, settings, tables, printers }
```

### Orders (LOCAL)
```
POST /orders
GET /orders
PATCH /orders/:id
```

### Orders (CLOUD Fallback)
```
POST /orders
GET /orders
PATCH /orders/:id
```

## Testing Checklist

- [ ] LOCAL server starts and connects to local PostgreSQL
- [ ] CLOUD server reachable and using Neon
- [ ] POS connects to LOCAL server on startup
- [ ] Back Office accessible at restaurantpos-8xew.onrender.com
- [ ] Menu items visible in POS from local database
- [ ] New item in Back Office appears in POS after 60-second sync
- [ ] Stop LOCAL server → POS switches to CLOUD after 3 failed attempts
- [ ] Start LOCAL server → POS switches back to LOCAL
- [ ] Orders saved to LOCAL database when in local mode
- [ ] Orders sent to CLOUD when in cloud mode
- [ ] Auto-sync every 60 seconds pulls latest data

## Troubleshooting

### Apps stuck in CLOUD mode
- Verify LOCAL server is running: `GET http://127.0.0.1:3001/health`
- Check firewall rules (port 3001)
- Restart local Express server
- Reset app failover counter

### LOCAL server not syncing with CLOUD
- Verify CLOUD server URL: `https://restaurantpos-8xew.onrender.com/health`
- Check API_KEY matches (pos-api-key-2026)
- Verify Neon database connection on Render server
- Check sync logs in server/logs/

### Sync taking longer than 60 seconds
- Check Neon database performance
- Check network latency to Render
- Monitor local PostgreSQL CPU/memory
- Check server logs for slow queries

---

**Last Updated**: 2026-05-30
**Architecture**: Dual-Mode LOCAL + CLOUD with auto-failover
**Status**: Ready for implementation
