# POS Auto-Update EXE - Build & Deploy Guide

## ✅ Integration Complete

The auto-update system has been fully integrated into the POS application:

### Files Updated:
1. **`pos/main.js`** - Added AutoUpdateMain handler
2. **`pos/renderer/index.html`** - Added update notification UI and CSS
3. **`pos/auto-update.js`** - Auto-update version checking logic
4. **`pos/auto-update-main.js`** - Electron main process handler
5. **`pos/renderer/auto-update-ui.js`** - Frontend update UI controller

### Features:
- ✅ Auto-check for updates on every startup
- ✅ Shows version info with release date & time
- ✅ One-click update installation
- ✅ Progress bar during download
- ✅ Auto-failover notification if update fails
- ✅ Beautiful notification UI (banner + modal)
- ✅ Version badge in login screen

---

## 🚀 Build EXE with Auto-Update

### Step 1: Ensure package.json has correct version

Edit `pos/package.json`:

```json
{
  "name": "restaurant-pos",
  "version": "2.1.0",
  "productName": "Restaurant POS",
  "...": "..."
}
```

### Step 2: Install electron-builder

```powershell
cd "C:\Users\Lenovo\AppData\Local\Temp\restaurantpos\pos"
npm install --save-dev electron-builder
```

### Step 3: Build the EXE

```powershell
npm run build:exe
# or
npx electron-builder --win nsis
```

**Build Output:**
- `dist/Restaurant POS Setup 2.1.0.exe` - Installer
- `dist/Restaurant POS 2.1.0.exe` - Portable version (optional)

### Step 4: Create GitHub Release

#### 4.1 Go to GitHub

```
https://github.com/arifpadup2-cmyk/restaurantpos/releases/new
```

#### 4.2 Create Release

**Tag:** `v2.1.0`
**Title:** `Release v2.1.0 - Auto-Update Support`
**Description:**

```markdown
## What's New

- ✅ Auto-update system on startup
- ✅ Show version with release date & time
- ✅ One-click update installation
- ✅ Progress bar during download
- ✅ Beautiful notification UI

## Installation

Download the installer and run it. POS will automatically check for updates each time you start it.

## Release Date

Released: [Current Date & Time]

## How Auto-Update Works

1. POS starts → checks GitHub for latest release
2. If new version available → notification banner appears
3. Click "Update Now" → download starts
4. Shows progress → installation runs automatically
5. Next startup uses new version

## Changelog

- Added auto-update system using GitHub releases
- Added update notification UI with release info
- Integrated auto-update into main window
- Added version badge to login screen
```

#### 4.3 Upload Files

Attach the built EXE:
- `dist/Restaurant POS Setup 3.10.0.exe` (REQUIRED)

### Step 5: Publish Release

Click "Publish release"

---

## 🧪 Testing Auto-Update Locally

### Test 1: Verify Update Check on Startup

1. Open `pos/renderer/index.html`
2. Check if version badge appears (bottom-left of login)
3. Wait 30 seconds for update check to complete
4. Badge should show status:
   - 🟡 Yellow = "Checking for updates"
   - 🟢 Green = "Latest version"
   - 🔴 Red = "Update available"

### Test 2: Manual Update Check

Add this to POS menu for manual check:

```javascript
// In pos/renderer/index.html or a menu
const manualCheckBtn = document.createElement('button');
manualCheckBtn.textContent = 'Check for Updates';
manualCheckBtn.onclick = async () => {
  const result = await window.electronAPI.checkForUpdates();
  if (result) {
    alert(`Update available: ${result.version}`);
  } else {
    alert('Already on latest version');
  }
};
```

### Test 3: Simulate Update

1. Create a test GitHub release `v3.10.1`
2. Upload a dummy .exe file
3. Restart POS
4. Update notification should appear
5. Click "Update Now" to trigger download

---

## 📋 Production Checklist

Before deploying to users:

### Code Quality
- [ ] All auto-update modules tested locally
- [ ] No console errors in dev tools (F12)
- [ ] Version badge visible on login
- [ ] Update notification UI renders correctly

### Build & Release
- [ ] EXE builds successfully
- [ ] Installer file is ~80-120MB
- [ ] GitHub release created with correct tag
- [ ] EXE file attached to release
- [ ] Release notes contain update instructions

### Testing
- [ ] Manual startup checks work
- [ ] Download progress bar visible
- [ ] Installation completes successfully
- [ ] Version updates correctly after install
- [ ] Can rollback to previous version if needed

### Security
- [ ] Code-sign EXE file (optional but recommended)
- [ ] Use HTTPS for GitHub downloads (automatic)
- [ ] Validate EXE file size before installation
- [ ] Users see "Publisher" info (if signed)

---

## 🐛 Troubleshooting

### Update Check Not Working
- Check internet connection
- Verify GitHub API is reachable: `https://api.github.com`
- Check browser console (F12) for errors
- Verify GitHub repository is public

### Download Fails
- Check file size on GitHub release
- Verify Downloads folder has permissions
- Check disk space
- Look at server logs for 404 errors

### EXE Won't Install
- Check if antivirus blocks it
- Try running as Administrator
- Check if previous version is running
- Try downloading file manually

### Version Not Updating
- Check package.json version after build
- Clear POS config: `AppData\Roaming\restaurant-pos\pos-config.json`
- Restart POS completely
- Check version badge status

---

## 📊 Update Statistics

Once deployed, monitor:

1. **Update Adoption:**
   - How many users check for updates
   - How many download updates
   - How many complete installation

2. **Error Tracking:**
   - Failed downloads
   - Failed installations
   - Network errors

3. **Performance:**
   - Update check duration
   - Download speed
   - Installation time

---

## 🚀 Deployment Steps (Summary)

```bash
# 1. Update version in package.json
# 2. Build EXE
npm run build:exe

# 3. Create GitHub release
# - Tag: v3.10.0
# - Upload EXE from dist/

# 4. Users get auto-notification on next startup
# 5. Click "Update Now" to install
```

---

## 📝 Next Steps After Deploy

1. **Monitor Feedback:**
   - Check GitHub issues for update problems
   - Monitor POS logs for update errors
   - Track user adoption

2. **Plan Updates:**
   - Develop features for next release
   - Test thoroughly before building
   - Update release notes clearly

3. **Maintenance:**
   - Keep old releases available for rollback
   - Monitor GitHub API rate limits
   - Archive very old releases (>6 months)

---

## 🎯 Success Criteria

✅ **Update System is Working When:**
- Users see version on login screen
- Update notification appears when new release available
- Users can click "Update Now" to install
- EXE installs successfully
- POS restarts with new version
- Version badge updates correctly

---

**Status:** Ready to Build & Deploy  
**Estimated Build Time:** 2-3 minutes  
**Estimated Users Impact:** Automatic, seamless updates  

Build the EXE and create the GitHub release to enable auto-updates for all users! 🎉
