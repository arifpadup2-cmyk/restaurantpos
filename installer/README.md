# Restaurant POS Installer

A one-click Windows installer that automates the complete setup of the Restaurant POS system.

## What It Does

The installer automatically:
1. ✅ Detects system requirements (Node.js, PostgreSQL, port availability)
2. ✅ Downloads and installs PostgreSQL 18 (if needed)
3. ✅ Creates the database and user (`pos_central_user`)
4. ✅ Installs the POS server with PM2 auto-restart
5. ✅ Configures Windows Firewall rules
6. ✅ Sets up auto-start on boot
7. ✅ Installs the POS Electron app

All in one wizard — no command line required!

## Building the Installer

### Prerequisites
- Windows 10/11 (64-bit)
- Node.js 18+ LTS
- Git (optional, for development)

### Build Steps

1. Navigate to the installer directory:
```powershell
cd "D:\sofwtares\RESTAURANT POS\installer"
```

2. Run the build script:
```powershell
.\build.ps1
```

The script will:
- Download PostgreSQL and Node.js installers (cached for future builds)
- Install npm dependencies
- Build the final `Restaurant POS Installer.exe` (~450MB)

**Note:** First build may take 5-10 minutes due to downloads. Subsequent builds are much faster.

### Build Output

```
dist/
├── Restaurant POS Installer.exe      (~450MB)
├── Restaurant POS Installer.exe.blockmap
└── latest.yml                        (update manifest)
```

## Using the Installer

### System Requirements
- Windows 10/11 (64-bit)
- 2 GB free disk space
- Internet connection (for first run)

### Installation Steps

1. **Double-click** `Restaurant POS Installer.exe`
2. **System Check** — Automatically detects what needs to be installed
3. **Restaurant Info** — Enter your restaurant name
4. **Installation** — Watch the automated setup complete
5. **Complete** — Shows server URL and login credentials

### First Login

After installation completes:

**Back Office (Admin Dashboard):**
- URL: `http://<server-ip>:3001`
- Username: `admin`
- Password: `Admin@1234`

**POS Terminal:**
- Launches automatically after installation
- Syncs menu from server on first run

## File Structure

```
installer/
├── package.json           # Electron + build config
├── main.js               # Main process (install orchestration)
├── preload.js            # IPC bridge (security)
├── build.ps1             # Build script
├── renderer/
│   ├── index.html        # 5-screen wizard UI
│   ├── app.js            # Frontend logic + event handlers
│   └── styles.css        # Modern dark theme
├── scripts/
│   ├── detect.js         # System detection
│   ├── install-postgres.js     # PostgreSQL setup
│   ├── install-server.js       # Server + PM2 + firewall
│   └── install-pos.js          # POS app installation
└── deps/                 # Downloaded installers (git-ignored)
```

## Development

### Running in Development Mode

```powershell
npm start
```

Opens the installer with DevTools for debugging.

### Modifying the Wizard

- **UI/Styles:** Edit `renderer/index.html` and `renderer/styles.css`
- **Screen Logic:** Edit `renderer/app.js`
- **Install Steps:** Edit `scripts/*.js` files

After changes, rebuild with `npm run build` or run `npm start` to test immediately.

## Troubleshooting

### PostgreSQL Installation Fails
- **Symptom:** "PostgreSQL installation failed"
- **Solution:** 
  - Ensure you have admin permissions
  - Check disk space (1.5GB needed)
  - Manually download from https://get.enterprisedb.com/postgresql/

### Ports Already in Use
- **Symptom:** "Port 3001 or 5432 already in use"
- **Solution:**
  - Stop the existing service using those ports
  - Or modify the `.env` file after installation

### Server Doesn't Start
- **Symptom:** Back Office URL unreachable after installation
- **Solution:**
  - Check Windows Defender/Firewall allowed the app
  - Run: `pm2 list` to see server status
  - Check logs: `C:\Program Files\Restaurant POS Server\logs\`

## Distribution

### Preparing for Distribution

1. Build the installer:
```powershell
.\build.ps1
```

2. Sign the executable (optional but recommended):
```powershell
signtool.exe sign /f YourCert.pfx /p YourPassword `
  /t http://timestamp.authority.com `
  dist\Restaurant POS Installer.exe
```

3. Upload to a distribution server or cloud storage

### Auto-Updates

After installation, the POS app checks for updates every 4 hours.

To push an update:
1. Build a new POS app: `npm run build` in `pos/`
2. Copy `dist/latest.yml` + `Setup.exe` to `server/updates/`
3. All running terminals will auto-update on next check

## Security Notes

- ⚠️ Default password should be **changed immediately** on first login
- PostgreSQL password is hardcoded (configure strong values in `install-postgres.js`)
- JWT secret should be regenerated for production
- Installer requires Administrator privileges (necessary for system services)

## Support

For issues or questions:
1. Check the logs in `C:\Program Files\Restaurant POS Server\logs\`
2. Review the wizard install log (stays visible during installation)
3. Consult the main POS repository README
