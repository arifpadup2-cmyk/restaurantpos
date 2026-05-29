# Restaurant POS Setup File Generator

Generate branded, outlet-specific setup files for distributing the Restaurant POS system across multiple locations.

## What It Does

Creates a `setup-{outlet-id}.exe` file that:
- Contains pre-configured brand and outlet information
- Asks installer whether to setup SERVER or TERMINAL
- Guides users through the appropriate installation path
- Works on both server and terminal/cashier machines

## Installation

```bash
npm install
```

## Usage

### Generate a setup file for an outlet

```bash
node generate.js --outlet outlet-123 --code QAT001
```

### With server IP (for terminals to auto-connect)

```bash
node generate.js --outlet outlet-123 --code QAT001 --serverIP 192.168.1.100
```

### All options

```bash
node generate.js \
  --outlet outlet-123 \
  --code QAT001 \
  --brandName "My Restaurant" \
  --serverIP 192.168.1.100 \
  --serverPort 3001 \
  --output ./branded-setups
```

## Output

The generator creates:
- `setup-{outlet-id}.exe` — The branded installer
- `setup-{outlet-id}-config.json` — Configuration reference

## Workflow

### 1. Restaurant owner downloads setup file

Back Office → Settings → Download Setup File
```
Input: Select outlet (dropdown)
Output: setup-outlet-123.exe (100MB)
```

### 2. Owner distributes to all machines

- **Server machine:** `setup-outlet-123.exe`
- **Each terminal:** Same `setup-outlet-123.exe`

### 3. Run installer on each machine

**Server:** Choose "Server Setup"
- Auto-detects Node.js, PostgreSQL, ports
- Installs database, server, PM2
- Saves outlet config
- Shows server IP + credentials

**Terminal:** Choose "Terminal Setup"
- Verifies connection to server
- Installs POS app
- Saves outlet and server info
- Ready to use

## Example: Multi-Location Restaurant

**Restaurant:** "Cairo Pizza"
- **Location 1:** Tahrir Square
  - Server: `setup-tahrir.exe`
  - Terminals: 5 × `setup-tahrir.exe`

- **Location 2:** Giza Plateau
  - Server: `setup-giza.exe`
  - Terminals: 3 × `setup-giza.exe`

Each file is generated once, then distributed to all machines at that location.

## For Back Office Integration

The Back Office will call this generator via API:

```javascript
POST /api/outlets/{id}/generate-setup
{
  "outletId": "outlet-123",
  "outletCode": "QAT001",
  "serverIP": "192.168.1.100"
}
```

The server runs:
```bash
node setup-generator/generate.js \
  --outlet outlet-123 \
  --code QAT001 \
  --serverIP 192.168.1.100 \
  --output ./downloads
```

And responds with download link:
```json
{
  "downloadUrl": "/downloads/setup-outlet-123.exe",
  "fileName": "setup-outlet-123.exe",
  "expiresAt": "2026-06-29T18:00:00Z"
}
```

## Security

- Setup files are generated on-demand
- Each outlet gets its own unique file
- Config is NOT embedded in exe (too complex), but matched by filename
- Setup files can expire after 24 hours
- Credentials are shown only once (at completion)

## Troubleshooting

### "Installer not built yet"
```bash
cd installer
npm install
npm run build
```

### "Output directory could not be created"
Ensure you have write permissions in the output directory.

### Setup file won't run
- Verify Windows Defender isn't blocking it
- Try right-click → Properties → Unblock
- Run as Administrator

## Technical Details

- Copies the main installer from `installer/dist/`
- Embeds configuration in `embedded-config.json`
- Uses NSIS for both server and terminal paths
- Version: 2.0.0+
