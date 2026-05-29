# Restaurant POS v3.10.0 — Deployment Guide

## 🎯 Quick Overview

This guide will help you set up **Restaurant POS v3.10.0** on your restaurant's Windows servers and terminals. The entire process takes about **30-45 minutes** with no technical experience needed.

**What you'll have at the end:**
- ✅ Fully functioning POS system
- ✅ Cloud backup of all daily sales
- ✅ Multi-terminal support
- ✅ One admin dashboard
- ✅ Data isolation per location

---

## 📋 Pre-Deployment Checklist

Before starting, make sure you have:

- [ ] **Server PC (Windows 10 Pro or later)**
  - RAM: 4GB minimum (8GB recommended)
  - Storage: 20GB SSD available
  - Network: Connected to same LAN as terminals
  - USB Port: For transferring files

- [ ] **Terminal PCs (one or more, Windows 10 Pro or later)**
  - RAM: 2GB minimum
  - Network: Connected to same LAN as server
  
- [ ] **Internet Connection**
  - Stable broadband for initial setup
  - Cloud backup requires internet

- [ ] **Files Ready**
  - [ ] `Restaurant POS Installer Setup 1.0.0.exe` (on USB or email)
  - [ ] This deployment guide (printed or on screen)
  - [ ] Outlet ID (e.g., "cairo", "giza") — create if you don't have one
  - [ ] Outlet Code (e.g., "CAIRO-001")

---

## ⏱️ Timeline

| Step | Task | Time |
|------|------|------|
| 1 | Download/Transfer Installer | 5 min |
| 2 | Server Setup | 10-15 min |
| 3 | Terminal Setup (per terminal) | 5 min each |
| 4 | Verification & Testing | 5-10 min |
| **Total** | **Complete System** | **30-45 min** |

---

## 🚀 STEP 1: Get the Installer

### Option A: Download from GitHub (Recommended)
```
1. Go to: https://github.com/arifpadup2-cmyk/restaurantpos/releases
2. Download: Restaurant POS Installer Setup 1.0.0.exe
   Link: https://github.com/arifpadup2-cmyk/restaurantpos/releases/download/v3.10.0/Restaurant%20POS%20Installer%20Setup%201.0.0.exe
3. File size: 72.64 MB
4. Copy to USB drive or email to team
```

### Option B: Download from Back Office (If Already Running)
```
1. If you already have a Back Office running:
   └─ Go to: http://{server-ip}:3001
   └─ Login: admin / Admin@1234
   └─ Click: "Downloads & System"
   └─ Click: "Download Installer" button
   └─ File downloads from GitHub automatically

2. Copy file to USB drive or email to team
```

### Option C: File from Your Provider
```
1. Copy the .exe file you received to a USB drive
2. Keep it safe — you'll use it on multiple PCs
```

---

## 💻 STEP 2: Server Setup (One-Time)

### On Your Server PC:

1. **Copy installer to desktop**
   ```
   USB Drive → Copy → Restaurant POS Installer Setup 1.0.0.exe
   Desktop → Paste here
   ```

2. **Run the installer**
   ```
   Double-click: Restaurant POS Installer Setup 1.0.0.exe
   
   Wait for welcome screen...
   ```

3. **Choose "Server Setup"**
   ```
   You'll see two options:
   ☑ Server Setup (choose this)
   ☐ Terminal Setup
   
   Click: Server Setup button
   ```

4. **Enter your outlet information**
   ```
   Outlet ID: cairo
      (use lowercase, no spaces)
   
   Outlet Code: CAIRO-001
      (use uppercase with hyphen)
   ```

5. **Wait for installation**
   ```
   You'll see 7 steps:
   ✅ Step 1: Node.js check
   ✅ Step 2: PostgreSQL install (may take 2-3 min)
   ✅ Step 3: Create database
   ✅ Step 4: Install server
   ✅ Step 5: Auto-start setup
   ✅ Step 6: Firewall config
   ✅ Step 7: Start server
   
   ⏳ Total: 10-15 minutes
   ```

6. **Installation complete!**
   ```
   You'll see:
   ✅ "Server Started"
   
   Important: Write down the SERVER IP shown
   Example: 192.168.1.100
   
   KEEP THIS IP — You'll need it for terminals!
   ```

7. **Verify server is running**
   ```
   Open web browser and go to:
   http://192.168.1.100:3001
   
   (Replace 192.168.1.100 with YOUR server IP)
   
   You should see login screen:
   Username: admin
   Password: Admin@1234
   
   ✅ If you see this, server is working!
   ```

---

## 🖥️ STEP 3: Terminal Setup (Repeat for Each Terminal)

### On Each Terminal PC:

1. **Copy installer to desktop**
   ```
   USB Drive → Copy → Restaurant POS Installer Setup 1.0.0.exe
   Desktop → Paste here
   ```

2. **Run the installer**
   ```
   Double-click: Restaurant POS Installer Setup 1.0.0.exe
   
   Wait for welcome screen...
   ```

3. **Choose "Terminal Setup"**
   ```
   You'll see two options:
   ☐ Server Setup
   ☑ Terminal Setup (choose this)
   
   Click: Terminal Setup button
   ```

4. **Enter server IP**
   ```
   Server IP: 192.168.1.100
   
   (Use the IP you wrote down from Step 2)
   ```

5. **Wait for installation**
   ```
   You'll see 3 steps:
   ✅ Step 1: Verify server connection
   ✅ Step 2: Install POS app
   ✅ Step 3: Configure terminal
   
   ⏳ Total: 3-5 minutes
   ```

6. **Installation complete!**
   ```
   POS application will launch automatically
   
   You should see POS login screen
   
   ✅ If you see login screen, terminal is working!
   ```

7. **Repeat for other terminals**
   ```
   If you have multiple terminals:
   - Terminal 2: Follow steps 1-6 again
   - Terminal 3: Follow steps 1-6 again
   - Terminal 4: etc.
   
   All terminals will connect to the same server
   and share the same data
   ```

---

## ✅ STEP 4: Verification & Testing

### Test 1: Open a Day (Server)
```
1. Open Back Office: http://192.168.1.100:3001
2. Login: admin / Admin@1234
3. Click: Dashboard
4. Click: "Open Day" button
5. You should see: "✅ Day opened"
```

### Test 2: Process a Test Order (Terminal)
```
1. On POS terminal, click "Login"
2. Select any cashier (or create new)
3. Click "Dine In"
4. Select a table
5. Add any menu item
6. Click "Place Order"
7. You should see: "✅ Order placed successfully"
```

### Test 3: Close the Day (Server)
```
1. Back Office → Dashboard
2. Click: "Close Day"
3. Confirm: "Close the day and save Z-Report?"
4. Click: "Close Day"
5. Wait a few seconds...
6. You should see: "✅ Day backed up to cloud successfully!"

⭐ THIS IS THE MOST IMPORTANT TEST
   This verifies your data is backed up to cloud
   If server crashes, you can recover all data
```

---

## 🔐 IMPORTANT: Change Default Password

⚠️ **DO THIS BEFORE GOING LIVE**

```
1. Open Back Office: http://192.168.1.100:3001
2. Login: admin / Admin@1234
3. Go to: Settings → Users/Staff
4. Find: admin user
5. Click: Edit
6. Change password to something secure
   Old: Admin@1234
   New: YourSecurePassword123!
7. Save changes

⭐ WARNING: Write down your new password!
   Keep it safe, you'll need it to access the system
```

---

## 🎯 Daily Operations

### Morning: Open the Day
```
1. Back Office → Dashboard
2. Click: "Open Day"
3. Enter starting cash (if required)
4. All terminals can now process orders
```

### During Day: Process Orders
```
1. Terminal → Select table
2. Add items to order
3. Click "Place Order"
4. Kitchen display shows order
5. When food is ready, mark as "Ready"
6. Customer pays
7. Close bill
```

### Evening: Close the Day
```
1. Close all open bills/orders
2. Back Office → Dashboard
3. Click: "Close Day"
4. Review daily summary
5. Click: "Close Day" to confirm

⭐ AUTOMATIC BACKUP HAPPENS HERE
   All orders + sales backed up to cloud ✅
   You'll see: "✅ Day backed up to cloud!"
```

---

## 🆘 Troubleshooting

### Issue: "Cannot connect to server"

**On Terminal, when trying to connect:**

```
Error: "Cannot connect to server at {IP}:3001"

Solution:
1. Check Server IP is correct
   └─ Go back to Step 2, verify IP
   
2. Check server is running
   └─ On server PC, open browser
   └─ Go to: http://192.168.1.100:3001
   └─ If blank/error, server crashed
   
3. Check network connection
   └─ Both PCs on same WiFi/LAN?
   └─ Can you ping the server?
   └─ Firewall blocking port 3001?
   
4. Restart server
   └─ Restart Windows server PC
   └─ Wait 30 seconds
   └─ Try connecting again
```

### Issue: "PostgreSQL not found"

**During server installation:**

```
Error: "'psql' is not recognized"

Solution:
1. Installation likely failed
2. Go to Windows Control Panel
3. Programs → Programs and Features
4. Find: PostgreSQL 18
5. Click: Uninstall
6. Restart Windows
7. Run installer again
8. When you see "Command Line Tools":
   ✅ MAKE SURE TO CHECK THIS BOX
```

### Issue: "Installer is very slow"

```
If installation takes more than 20 minutes:

1. Check internet speed
   └─ Install is downloading PostgreSQL (300MB)
   └─ Slow internet = slow install
   
2. Check disk space
   └─ Is C: drive almost full?
   └─ Need at least 20GB free
   
3. Check PC specs
   └─ Old PC? Old hard drive?
   └─ May take longer, but will complete
   
4. Don't close installer!
   └─ Let it run
   └─ It will finish
```

### Issue: "Day close failed to backup"

```
You see: "⚠️ Cloud backup not available"

Don't worry! This means:
✅ Day still closed successfully
✅ All data saved locally
⚠️ But cloud backup didn't upload

Possible causes:
- Internet connection issue
- Cloud service temporarily down

Solution:
1. Check internet connection
   └─ Can you browse websites?
   └─ Is connection stable?
   
2. Try closing day again tomorrow
   └─ Cloud backup will retry
   └─ Your data is safe locally
   
3. Contact support if issue persists
```

---

## 📞 Need Help?

### Common Resources

1. **Back Office Help**
   - Click: ? icon in Back Office
   - See: Contextual help for each feature

2. **Check System Status**
   - Back Office → Downloads & System
   - See: Server info, database status
   - Verify: PostgreSQL running

3. **Review Logs**
   - Back Office → Audit Log
   - See: All transactions, logins, errors
   - Helps diagnose issues

### Contact Support

If you need help:

```
Email: support@restaurantpos.example.com
Phone: +1-XXX-XXX-XXXX
Hours: 9 AM - 6 PM (Your Timezone)

Include:
- What happened?
- What error message?
- Screenshot if possible
- Server IP address (for context)
```

---

## 🔄 Backup & Recovery

### Automatic Daily Backup
```
When you "Close Day":
✅ All orders backed up to cloud
✅ All sales backed up to cloud
✅ All settings backed up to cloud

Recovery:
If server crashes:
1. Install on new Windows PC
2. Run Server Setup again
3. All data automatically restored from cloud
4. ✅ Zero data loss!
```

### Manual Backup (Extra Safety)

```
Once a week, download backup:
1. Back Office → Downloads & System
2. Click: "Download Full System Backup"
3. Save to external USB drive
4. Keep USB drive safe

This is your insurance policy if cloud fails
```

---

## 📊 System Overview

### What You Have

```
Restaurant POS v3.10.0
├─ Server PC (Running PostgreSQL + API)
├─ Terminal PCs (Running POS app)
├─ Back Office Web App (Admin dashboard)
├─ Cloud Backup (Auto daily backups)
└─ Isolated Database (Per outlet)
```

### Network Setup

```
         Your Restaurant LAN
              (WiFi or Ethernet)
    
    ┌─────────────────────────┐
    │    Server PC            │
    │  (PostgreSQL database)  │
    │  (API server)           │
    │  Port: 3001             │
    └──────────────┬──────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
    ┌───▼──┐  ┌───▼──┐  ┌───▼──┐
    │Term1 │  │Term2 │  │Term3 │
    │(POS) │  │(POS) │  │(POS) │
    └──────┘  └──────┘  └──────┘
    
    ☁️ Cloud Backup
       (Automatic)
```

---

## ⚡ Quick Reference

### Important Ports

```
3001  - Back Office API & Web Interface
5432  - PostgreSQL Database
        (Usually only accessible locally)
```

### Important Usernames/Passwords

```
CHANGE BEFORE GOING LIVE!

Back Office Admin:
  Username: admin
  Password: Admin@1234 (⚠️ CHANGE THIS!)

PostgreSQL (don't usually need):
  User: pos_{outlet_id}_user
  Example: pos_cairo_user
  Password: pos_{outlet_id}_secure_2024!
  Example: pos_cairo_secure_2024!
```

### Important Directories

```
Server PC:
  PostgreSQL Data: C:\Program Files\PostgreSQL\18\data
  API Server: C:\Program Files\Restaurant POS Server\
  Backups: server\backups\
  
Terminal PC:
  POS Config: C:\Users\{username}\AppData\Local\Restaurant POS\
```

---

## 📈 Next Steps After Deployment

### Day 1
- [ ] Test all features
- [ ] Train staff on POS
- [ ] Change admin password
- [ ] Process test orders

### Week 1
- [ ] Monitor for issues
- [ ] Verify daily backups
- [ ] Train all staff members
- [ ] Set up menu items
- [ ] Configure printers

### Week 2+
- [ ] Go live with real orders
- [ ] Monitor system performance
- [ ] Collect feedback from staff
- [ ] Make any adjustments

---

## 🎉 Congratulations!

You've successfully deployed **Restaurant POS v3.10.0**!

Your system now has:
- ✅ Multi-terminal support
- ✅ Automatic cloud backup
- ✅ Data isolation
- ✅ Admin dashboard
- ✅ Real-time POS

**You're ready to start taking orders!** 🚀

---

## 📝 Deployment Checklist

Keep this for your records:

```
DEPLOYMENT CHECKLIST - {Restaurant Name}
Deployment Date: _______________
Deployed By: _______________

SERVER SETUP:
  [ ] Installer downloaded/received
  [ ] Installer run on server PC
  [ ] PostgreSQL installation completed
  [ ] Server setup completed
  [ ] Server IP noted: _______________
  [ ] Back Office accessible
  [ ] Default password changed

TERMINAL SETUP:
  [ ] Terminal 1 - Installer run
  [ ] Terminal 1 - Connected to server
  [ ] Terminal 1 - POS working
  [ ] Terminal 2 - Installer run (if applicable)
  [ ] Terminal 2 - Connected to server
  [ ] Terminal 2 - POS working

VERIFICATION:
  [ ] Day opened successfully
  [ ] Test order placed
  [ ] Test order completed
  [ ] Day closed successfully
  [ ] Cloud backup confirmed
  [ ] Staff trained on basic POS

NOTES:
_________________________________
_________________________________
_________________________________

Contact for support: _______________
```

---

*Restaurant POS v3.10.0 - Deployment Guide*  
*Generated: 2026-05-29*  
*Keep this guide handy for reference!*
