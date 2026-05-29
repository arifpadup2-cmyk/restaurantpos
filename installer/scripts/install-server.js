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

const installServer = async (restaurantName, onLog) => {
  try {
    const serverInstallDir = 'C:\\Program Files\\Restaurant POS Server'
    const sourceDir = path.join(__dirname, '..', '..', 'server')

    onLog('Creating server directory...')
    if (!fs.existsSync(serverInstallDir)) {
      fs.mkdirSync(serverInstallDir, { recursive: true })
    }

    onLog('Copying server files...')
    copyRecursive(sourceDir, serverInstallDir, ['node_modules', '.git', '.env', '.env.local'])

    onLog('Writing configuration...')
    const envContent = `
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=restaurant_pos_central
DB_USER=pos_central_user
DB_PASS=pos_secure_2024!
PORT=3001
API_KEY=pos-api-key-2026
JWT_SECRET=bo-jwt-secret-change-in-production-2026
NODE_ENV=production
CLOUD_SYNC_URL=https://restaurantpos.example.com
RESTAURANT_NAME=${restaurantName}
`.trim()

    fs.writeFileSync(path.join(serverInstallDir, '.env'), envContent)

    onLog('Installing dependencies...')
    execSync('npm install --omit=dev', {
      cwd: serverInstallDir,
      stdio: 'pipe'
    })

    onLog('✓ Server installed successfully')
    return getLocalIP()
  } catch (error) {
    throw new Error(`Server installation failed: ${error.message}`)
  }
}

const configureAutoStart = async (onLog) => {
  try {
    onLog('Installing PM2...')
    execSync('npm install -g pm2', { stdio: 'pipe' })

    onLog('Configuring PM2 auto-startup...')
    execSync('pm2 startup', { stdio: 'pipe' })

    const serverInstallDir = 'C:\\Program Files\\Restaurant POS Server'
    const ecosystemConfig = `
module.exports = {
  apps: [{
    name: 'restaurant-pos-server',
    script: 'index.js',
    cwd: '${serverInstallDir}',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
`.trim()

    fs.writeFileSync(path.join(serverInstallDir, 'ecosystem.config.js'), ecosystemConfig)

    execSync(`pm2 start "${serverInstallDir}\\ecosystem.config.js"`, { stdio: 'pipe' })
    execSync('pm2 save', { stdio: 'pipe' })

    onLog('✓ Auto-startup configured')
  } catch (error) {
    throw new Error(`Auto-startup configuration failed: ${error.message}`)
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
