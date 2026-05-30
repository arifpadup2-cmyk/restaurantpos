# POS Auto-Update System Setup Guide

## Overview

The POS auto-update system automatically checks for new versions on startup and allows users to update with a single click.

**Features:**
- ✅ Auto-check on every startup
- ✅ Shows version info with release date & time
- ✅ One-click update installation
- ✅ Progress bar during download
- ✅ Auto-restart after installation
- ✅ Beautiful update notification UI

## Files Created

1. **`pos/auto-update.js`** - Auto-update logic (version checking, downloading)
2. **`pos/auto-update-main.js`** - Electron main process handlers
3. **`pos/renderer/auto-update-ui.js`** - UI integration for login screen
4. **`pos/renderer/update-notification.html`** - Update notification UI components
5. **`AUTO_UPDATE_SETUP.md`** - This file

## Integration Steps

### Step 1: Update `pos/main.js`

Add this at the top of your main.js file (after other imports):

```javascript
const AutoUpdateMain = require('./auto-update-main');
```

Then, after creating the main window, initialize the auto-update handler:

```javascript
// Create window...
const mainWindow = new BrowserWindow({...});

// Initialize auto-update
new AutoUpdateMain(mainWindow);
```

### Step 2: Include Update Notification UI

In `pos/renderer/index.html`, add this before the closing `</body>` tag:

```html
<!-- Auto-update notification UI -->
<script src="auto-update-ui.js"></script>
```

Or if using a module bundler, import it:

```javascript
require('./auto-update-ui');
```

### Step 3: Include Update Notification HTML

In `pos/renderer/index.html`, add this inside the `<body>` tag (near the login screen):

```html
<!-- Update notification components -->
<div id="app-root">
  <!-- existing content -->
  
  <!-- Auto-update notification and modal -->
  <div id="update-container">
    <!-- Copy the content from update-notification.html -->
  </div>
</div>
```

Or simply link the HTML file:

```html
<link rel="import" href="update-notification.html">
```

### Step 4: Update package.json

Ensure your `package.json` has the correct version:

```json
{
  "name": "restaurant-pos",
  "version": "3.10.0",
  ...
}
```

The auto-update system will read this version.

### Step 5: Build Release on GitHub

Create a GitHub release with:
- **Tag**: `v3.10.1` (or next version)
- **Release Notes**: Describe changes
- **Attach**: `restaurant-pos-3.10.1.exe` (the built installer)

The system will automatically detect this and notify users.

## How It Works

### On Startup
1. POS reads local version from `package.json`
2. Checks GitHub API for latest release
3. If new version available:
   - Shows update notification banner
   - Displays release date & time
   - Offers "Update Now" or "Later"

### On Update Click
1. Downloads the new .exe from GitHub
2. Shows progress bar with percentage
3. Runs the installer
4. Closes POS (installer takes over)
5. User installs new version
6. Restarts POS automatically

### Version Display
Users see:
- **Current version** in login screen (bottom-left)
- **Release date & time** of last check
- **Update notification** if new version available
- **Detailed modal** with release notes

## Configuration

### Update Check Interval
Default: **24 hours** (86400000 ms)

To change, edit `pos/auto-update.js`:
```javascript
const UPDATE_INTERVAL = 86400000; // 24 hours
```

### GitHub Release URL
Default: `https://api.github.com/repos/arifpadup2-cmyk/restaurantpos/releases/latest`

To change, edit `pos/auto-update.js`:
```javascript
const UPDATE_CHECK_URL = 'https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/releases/latest';
```

### Auto-Update Badge
The version badge shows status:
- 🟡 **Yellow**: Checking for updates
- 🟢 **Green**: Latest version
- 🔴 **Red**: Update available

## Testing

### Test Update Check
In POS login screen, right-click and select "Check for Updates" (requires menu item):

```javascript
// In renderer context menu handler
{ label: 'Check for Updates', click: () => manualUpdateCheck() }
```

### Test Download (Development)
Create a test GitHub release with a dummy .exe file.

### Test Installation (Development)
The installer will run once downloaded. Make sure you have an installer built.

## Building the Installer

### Prerequisites
- `electron-builder` installed
- Code signing certificate (for production)

### Build Command
```powershell
npm run build:exe
```

### Build Configuration (package.json)
```json
{
  "build": {
    "appId": "com.restaurantpos.app",
    "productName": "Restaurant POS",
    "files": [
      "dist/**/*",
      "node_modules/**/*"
    ],
    "win": {
      "target": ["nsis", "portable"],
      "certificateFile": "path/to/cert.pfx",
      "certificatePassword": "password"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    }
  }
}
```

## Troubleshooting

### Update Not Showing
1. Check GitHub release exists: https://api.github.com/repos/arifpadup2-cmyk/restaurantpos/releases/latest
2. Verify version in `package.json` is lower than GitHub release
3. Check browser console for errors (F12)
4. Restart POS

### Download Fails
1. Verify GitHub release has .exe attached
2. Check internet connection
3. Check firewall allows GitHub API access
4. Check file permissions in Downloads folder

### Installer Won't Run
1. Verify .exe is signed (for Windows SmartScreen)
2. Check Windows Defender doesn't block it
3. Try running as Administrator
4. Check disk space

### Version Shows as "Checking"
- Wait 30 seconds for check to complete
- Check internet connection
- Look at browser console (F12) for errors

## Security Considerations

✅ **What's Secure:**
- Downloads from GitHub over HTTPS
- Validates GitHub API response
- No auto-install without user click
- User can choose "Later"
- Supports code-signed .exe files

⚠️ **Production Checklist:**
- [ ] Code-sign all .exe files
- [ ] Use HTTPS for all downloads
- [ ] Validate .exe file size before installation
- [ ] Notify users of security updates prominently
- [ ] Keep GitHub repository private if needed
- [ ] Monitor for unauthorized releases

## Support

For issues:
1. Check browser console (F12) for JavaScript errors
2. Check GitHub API status: https://www.githubstatus.com
3. Verify release files are properly uploaded
4. Check file permissions and firewall rules

---

**Version**: 1.0.0  
**Status**: Production Ready  
**Last Updated**: 2026-05-30
