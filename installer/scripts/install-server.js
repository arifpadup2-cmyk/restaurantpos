const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const getLocalIP = () => {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

const installServer = async (brandId, outletId, outletCode, dbName, dbUser, dbPassword, onLog) => {
  try {
    const serverInstallDir = 'C:\\RestaurantPOS\\Server'
    const sourceDir = path.join(__dirname, '..', '..', 'server')
    const posDir = path.join(__dirname, '..', '..', 'pos')

    onLog('Creating server directory...')
    if (fs.existsSync(serverInstallDir)) {
      // Remove old installation
      fs.rmSync(serverInstallDir, { recursive: true, force: true })
    }
    fs.mkdirSync(serverInstallDir, { recursive: true })

    onLog('Copying server files...')
    copyRecursive(sourceDir, serverInstallDir, ['node_modules', '.git', '.env', '.env.local'])

    onLog('Copying POS migrations...')
    const posmigrationsDir = path.join(posDir, 'migrations')
    const serverMigrationsDir = path.join(serverInstallDir, 'migrations')
    if (fs.existsSync(posmigrationsDir)) {
      copyRecursive(posmigrationsDir, serverMigrationsDir)
    }

    onLog('Writing outlet-specific configuration...')
    const envContent = `
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=${dbName}
DB_USER=${dbUser}
DB_PASS=${dbPassword}
PORT=3001
API_KEY=pos-api-key-2026
JWT_SECRET=bo-jwt-secret-change-in-production-2026
NODE_ENV=production
CLOUD_SYNC_URL=https://restaurantpos.example.com
BRAND_ID=${brandId}
OUTLET_ID=${outletId}
OUTLET_CODE=${outletCode}
`.trim()

    fs.writeFileSync(path.join(serverInstallDir, '.env'), envContent)

    // Also save outlet info as JSON
    const outletConfig = {
      brandId,
      outletId,
      outletCode,
      database: dbName,
      dbUser: dbUser,
      createdAt: new Date().toISOString()
    }
    fs.writeFileSync(
      path.join(serverInstallDir, 'outlet-config.json'),
      JSON.stringify(outletConfig, null, 2)
    )

    onLog('Installing dependencies...')
    execSync('npm install --omit=dev', {
      cwd: serverInstallDir,
      stdio: 'pipe'
    })

    onLog('✓ Server installed with outlet-specific database')
    return getLocalIP()
  } catch (error) {
    throw new Error(`Server installation failed: ${error.message}`)
  }
}

const configureAutoStart = async (onLog) => {
  try {
    const serverInstallDir = 'C:\\RestaurantPOS\\Server'

    // Create a simple batch file for starting the server
    const startBatch = `@echo off\ncd /d "${serverInstallDir}"\nnode index.js\n`
    fs.writeFileSync(path.join(serverInstallDir, 'START-SERVER.bat'), startBatch)

    onLog('✓ Server startup script created')
    onLog('Server can be started manually using: C:\\RestaurantPOS\\Server\\START-SERVER.bat')
  } catch (error) {
    onLog(`⚠ Auto-startup configuration warning: ${error.message}`)
  }
}

const configureFirewall = async (onLog) => {
  try {
    onLog('Opening firewall for port 3001...')
    execSync(
      'netsh advfirewall firewall add rule name="Restaurant POS API" dir=in action=allow protocol=TCP localport=3001',
      { stdio: 'pipe' }
    )

    onLog('Opening firewall for port 5432...')
    execSync(
      'netsh advfirewall firewall add rule name="Restaurant POS DB" dir=in action=allow protocol=TCP localport=5432',
      { stdio: 'pipe' }
    )

    onLog('✓ Firewall configured')
  } catch (error) {
    onLog(`Firewall configuration warning: ${error.message}`)
  }
}

const copyRecursive = (src, dest, ignore = []) => {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }

  const files = fs.readdirSync(src)
  files.forEach(file => {
    if (ignore.includes(file)) return

    const srcPath = path.join(src, file)
    const destPath = path.join(dest, file)
    const stats = fs.statSync(srcPath)

    if (stats.isDirectory()) {
      copyRecursive(srcPath, destPath, ignore)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  })
}

module.exports = { installServer, configureAutoStart, configureFirewall }
