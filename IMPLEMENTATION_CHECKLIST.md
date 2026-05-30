# Restaurant POS - Dual-Mode Implementation Checklist

## ✅ COMPLETED (2026-05-30)

### Cloud Setup
- ✅ Neon PostgreSQL database created: `neondb`
- ✅ Render server running at: `https://restaurantpos-8xew.onrender.com`
- ✅ Cloud server configured to use Neon
- ✅ Back Office accessible at cloud server

### Documentation
- ✅ `DUAL_MODE_ARCHITECTURE.md` - Complete system design
- ✅ `LOCAL_SERVER_SETUP.md` - Step-by-step setup guide
- ✅ Architecture documented in memory: `architecture_dual_mode.md`
- ✅ Memory updated with Neon connection details

### Test Outlet Setup
- ✅ Test Outlet: Fresh Test Outlet (YK767P)
- ✅ Outlet Code: YK767P
- ✅ Outlet ID: 565B10A0AD
- ✅ Brand ID: REST-GPPE8G

## 🔄 IN PROGRESS (Next Steps)

### Phase 1: LOCAL Server Setup (1-2 hours)

- [ ] **Step 1.1**: Verify PostgreSQL installed on restaurant PC
  ```powershell
  psql --version  # Should be PostgreSQL 16+
  ```

- [ ] **Step 1.2**: Create PostgreSQL user and database
  ```powershell
  # Create user
  psql -U postgres -c "CREATE USER pos_central_user WITH PASSWORD 'pos_secure_2024!';"
  
  # Create database
  psql -U postgres -c "CREATE DATABASE restaurant_pos_central OWNER pos_central_user;"
  ```

- [ ] **Step 1.3**: Verify database connection
  ```powershell
  psql -U pos_central_user -d restaurant_pos_central -c "SELECT version();"
  ```

- [ ] **Step 1.4**: Clone or update GitHub repo
  ```powershell
  cd C:\Users\Lenovo\AppData\Local\Temp
  git clone https://github.com/arifpadup2-cmyk/restaurantpos
  # OR: git pull (if already cloned)
  ```

- [ ] **Step 1.5**: Create server/.env file
  - Copy from `LOCAL_SERVER_SETUP.md`
  - Update credentials as needed
  - Set `PORT=3001`

- [ ] **Step 1.6**: Install server dependencies
  ```powershell
  cd server
  npm install
  ```

- [ ] **Step 1.7**: Start LOCAL server
  ```powershell
  npm start
  # Should output: "Server running on port 3001"
  ```

- [ ] **Step 1.8**: Test server health
  ```powershell
  # In another PowerShell:
  curl http://127.0.0.1:3001/health
  # Should return: 200 OK
  ```

### Phase 2: POS App Dual-Mode Configuration (1 hour)

- [ ] **Step 2.1**: Create pos-config.json
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
    "autoFailoverThreshold": 3,
    "failoverAttempts": 0,
    "syncInterval": 60000
  }
  ```

- [ ] **Step 2.2**: Update POS app code for dual-mode
  - [ ] Add health check function (every 5 seconds)
  - [ ] Add failover counter logic (3 failures → switch to CLOUD)
  - [ ] Add auto-recovery logic (success → reset counter, switch to LOCAL if in CLOUD)
  - [ ] Add server URL selection: `getServerUrl()` function

- [ ] **Step 2.3**: Start POS app
  - [ ] Verify it connects to `http://127.0.0.1:3001` (LOCAL mode)
  - [ ] Check console for: "Connected to LOCAL server"
  - [ ] Verify outlet code: YK767P

- [ ] **Step 2.4**: Test basic POS flow
  - [ ] Login with test credentials
  - [ ] Create test order
  - [ ] Verify order appears in LOCAL database

### Phase 3: Waiter/KDS/Delivery App Configuration (1-2 hours)

- [ ] **Step 3.1**: Update Waiter App
  - [ ] Add dual-mode server selection logic
  - [ ] Set LOCAL URL: `http://127.0.0.1:3001/waiter-app`
  - [ ] Set CLOUD URL: `https://restaurantpos-8xew.onrender.com/waiter-app`
  - [ ] Test: Open waiter app, verify local connection

- [ ] **Step 3.2**: Update KDS
  - [ ] Add dual-mode server selection logic
  - [ ] Set LOCAL URL: `http://127.0.0.1:3001/kds`
  - [ ] Set CLOUD URL: `https://restaurantpos-8xew.onrender.com/kds`
  - [ ] Test: Open KDS, verify orders appear from POS

- [ ] **Step 3.3**: Update Delivery App
  - [ ] Add dual-mode server selection logic
  - [ ] Set LOCAL URL: `http://127.0.0.1:3001/delivery-app`
  - [ ] Set CLOUD URL: `https://restaurantpos-8xew.onrender.com/delivery-app`
  - [ ] Test: Open delivery app, verify local connection

### Phase 4: Auto-Sync Verification (30 minutes)

- [ ] **Step 4.1**: Verify 60-second sync
  - [ ] Open Back Office (CLOUD): `https://restaurantpos-8xew.onrender.com`
  - [ ] Login: chillzoneice218 / PWDPU782!
  - [ ] Go to Menu → Add new test item: "Cloud Test Burger"
  - [ ] Wait 60 seconds
  - [ ] Check LOCAL database or POS menu
  - [ ] New item should appear

- [ ] **Step 4.2**: Monitor sync logs
  - [ ] Check LOCAL server logs: `server/logs/sync.log` (or console)
  - [ ] Should see: "Pulling updates from cloud...", "Synced X items", "DB updated"

- [ ] **Step 4.3**: Test reverse sync (local → cloud)
  - [ ] Create order in LOCAL POS
  - [ ] Verify order appears in CLOUD Back Office reports

### Phase 5: Auto-Failover Testing (1 hour)

- [ ] **Step 5.1**: Test LOCAL → CLOUD failover
  - [ ] LOCAL server running, POS in LOCAL mode
  - [ ] Stop LOCAL server: `Ctrl+C` in Express terminal
  - [ ] POS should detect failure after 3 attempts (~15 seconds)
  - [ ] POS should switch to CLOUD mode
  - [ ] Verify console shows: "Switched to CLOUD mode"

- [ ] **Step 5.2**: Test creating order in CLOUD mode
  - [ ] While POS in CLOUD mode, create test order
  - [ ] Order should be sent to CLOUD server (Neon)
  - [ ] Verify order in Back Office

- [ ] **Step 5.3**: Test CLOUD → LOCAL recovery
  - [ ] Restart LOCAL server: `npm start`
  - [ ] POS should detect recovery
  - [ ] After 1 successful health check: "Switched to LOCAL mode"
  - [ ] Any orders created in CLOUD should sync back to LOCAL

- [ ] **Step 5.4**: Test all apps failover
  - [ ] Repeat steps 5.1-5.3 with Waiter, KDS, Delivery apps
  - [ ] Verify all apps switch and recover together

### Phase 6: Performance & Load Testing (Optional)

- [ ] **Step 6.1**: Monitor sync performance
  - [ ] Time how long sync takes (should be <5 seconds)
  - [ ] Check database CPU/memory during sync
  - [ ] Check network latency to Render cloud

- [ ] **Step 6.2**: Stress test with multiple orders
  - [ ] Create 10+ orders in POS
  - [ ] Verify all orders sync to cloud
  - [ ] Verify cloud syncs items back to local

- [ ] **Step 6.3**: Test offline capability
  - [ ] Stop LOCAL server
  - [ ] Disable internet on local POS device
  - [ ] POS should stay in LOCAL mode (since server is unreachable)
  - [ ] Wait for failover (3 failures)
  - [ ] POS might show "CLOUD unavailable" but should allow offline operation

## 📋 TESTING CHECKLIST

Once everything is configured, run these tests:

```
LOCAL Mode Tests:
- [ ] POS connects to 127.0.0.1:3001
- [ ] Creates orders → saved to local DB
- [ ] Menu items visible
- [ ] Staff/cashiers visible
- [ ] Settings loaded
- [ ] Print receipt works
- [ ] KOT printed to kitchen printer

Auto-Sync Tests:
- [ ] New item in Back Office appears in POS after 60s
- [ ] Updated item in Back Office updates in POS after 60s
- [ ] New staff in Back Office appears in POS after 60s
- [ ] Changed settings sync to POS

Auto-Failover Tests:
- [ ] Stop LOCAL server → POS switches to CLOUD
- [ ] Start LOCAL server → POS switches back
- [ ] CLOUD mode creates orders successfully
- [ ] Orders in CLOUD mode appear in Back Office
- [ ] Orders sync back to LOCAL after recovery

Waiter App Tests:
- [ ] Connects to LOCAL server (127.0.0.1:3001)
- [ ] PIN login works
- [ ] Can see tables
- [ ] Can create orders
- [ ] Orders appear in POS

KDS Tests:
- [ ] Connects to LOCAL server
- [ ] Shows orders from POS
- [ ] Can mark items done
- [ ] Real-time updates from POS

Delivery App Tests:
- [ ] Connects to LOCAL server
- [ ] Can claim delivery orders
- [ ] Can mark picked up/delivered
- [ ] Updates appear in Back Office
```

## 🔧 TROUBLESHOOTING

If any test fails, check:

1. **Connection Issues**:
   - Verify LOCAL server running: `curl http://127.0.0.1:3001/health`
   - Check firewall: Allow port 3001
   - Check network: All devices on same LAN

2. **Database Issues**:
   - Verify PostgreSQL running: `psql -U postgres -c "SELECT 1"`
   - Verify user created: `psql -U postgres -l | grep restaurant_pos`
   - Check .env credentials match actual PostgreSQL setup

3. **Sync Issues**:
   - Check CLOUD_SYNC_URL: `https://restaurantpos-8xew.onrender.com/health`
   - Verify API_KEY matches: pos-api-key-2026
   - Check internet connection
   - Check server logs for errors

4. **Failover Issues**:
   - Reset failover counter: Edit pos-config.json `"failoverAttempts": 0`
   - Restart POS app
   - Check console logs for health check messages

## 📞 SUPPORT

- **Local Server Issues**: Check `server/logs/` files
- **Cloud Connection Issues**: Check Render dashboard and Neon logs
- **App Issues**: Check browser console (F12) for errors
- **Database Issues**: Use `psql` to query directly

---

## Next Action

**YOU ARE HERE** ↓

Start with **Phase 1: LOCAL Server Setup** (1-2 hours)
- Follow the steps in order
- Test each step before moving to next
- If any step fails, check troubleshooting guide

**Estimated Total Time**: 4-6 hours (all phases)

---

**Created**: 2026-05-30
**Status**: Ready for implementation
**Contact**: arifpadup@gmail.com
