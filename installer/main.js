const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

let mainWindow

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.on('ready', createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

const { detectSystem, detectPostgreSQL } = require('./scripts/detect')
const { installPostgreSQL, createDatabase } = require('./scripts/install-postgres')
const { installServer, configureAutoStart, configureFirewall } = require('./scripts/install-server')
const { installPOS } = require('./scripts/install-pos')
const { execSync } = require('child_process')

ipcMain.handle('check-system', async () => {
  try {
    const result = await detectSystem()
    return result
  } catch (error) {
    throw new Error(`System check failed: ${error.message}`)
  }
})

ipcMain.handle('start-install', async (event, config) => {
  const { mode, brandId, outletId, outletCode, serverIP } = config

  if (mode === 'server') {
    return await startServerInstallation(brandId, outletId, outletCode)
  } else if (mode === 'terminal') {
    return await startTerminalInstallation(serverIP)
  }
})

const startServerInstallation = async (brandId, outletId, outletCode) => {
  const steps = 7
  let serverIP = '127.0.0.1'
  let psqlPath = null

  try {
    // Step 1: Install Node.js
    mainWindow.webContents.send('install-progress', {
      step: 1,
      total: steps,
      message: 'Checking Node.js...',
      status: 'running'
    })
    mainWindow.webContents.send('install-log', 'Node.js already available')
    mainWindow.webContents.send('install-progress', {
      step: 1,
      total: steps,
      message: 'Node.js ready',
      status: 'done'
    })

    // Step 2: Install PostgreSQL
    mainWindow.webContents.send('install-progress', {
      step: 2,
      total: steps,
      message: 'Installing PostgreSQL...',
      status: 'running'
    })
    psqlPath = await installPostgreSQL((msg) => {
      mainWindow.webContents.send('install-log', msg)
    })
    mainWindow.webContents.send('install-progress', {
      step: 2,
      total: steps,
      message: 'PostgreSQL ready',
      status: 'done'
    })

    // Step 3: Create Database
    mainWindow.webContents.send('install-progress', {
      step: 3,
      total: steps,
      message: 'Creating outlet database...',
      status: 'running'
    })
    let dbConfig = {}
    dbConfig = await createDatabase(psqlPath, outletId, (msg) => {
      mainWindow.webContents.send('install-log', msg)
    })
    mainWindow.webContents.send('install-progress', {
      step: 3,
      total: steps,
      message: 'Outlet database created',
      status: 'done'
    })

    // Step 4: Install Server
    mainWindow.webContents.send('install-progress', {
      step: 4,
      total: steps,
      message: 'Installing server...',
      status: 'running'
    })
    serverIP = await installServer(brandId, outletId, outletCode, dbConfig.dbName, dbConfig.dbUser, dbConfig.dbPassword, (msg) => {
      mainWindow.webContents.send('install-log', msg)
    })
    mainWindow.webContents.send('install-progress', {
      step: 4,
      total: steps,
      message: 'Server installed',
      status: 'done'
    })

    // Step 5: Configure Auto-Start
    mainWindow.webContents.send('install-progress', {
      step: 5,
      total: steps,
      message: 'Configuring auto-start...',
      status: 'running'
    })
    await configureAutoStart((msg) => {
      mainWindow.webContents.send('install-log', msg)
    })
    mainWindow.webContents.send('install-progress', {
      step: 5,
      total: steps,
      message: 'Auto-start configured',
      status: 'done'
    })

    // Step 6: Configure Firewall
    mainWindow.webContents.send('install-progress', {
      step: 6,
      total: steps,
      message: 'Configuring firewall...',
      status: 'running'
    })
    await configureFirewall((msg) => {
      mainWindow.webContents.send('install-log', msg)
    })
    mainWindow.webContents.send('install-progress', {
      step: 6,
      total: steps,
      message: 'Firewall configured',
      status: 'done'
    })

    // Step 7: Wait for server
    mainWindow.webContents.send('install-progress', {
      step: 7,
      total: steps,
      message: 'Starting server...',
      status: 'running'
    })
    mainWindow.webContents.send('install-log', 'Waiting for server to start...')
    await new Promise(resolve => setTimeout(resolve, 3000))
    mainWindow.webContents.send('install-progress', {
      step: 7,
      total: steps,
      message: 'Server started',
      status: 'done'
    })

    // Create desktop shortcut using PowerShell
    const desktopPath = path.join(os.homedir(), 'Desktop')
    const shortcutPath = path.join(desktopPath, 'Restaurant POS.lnk')
    const posDir = 'D:\\sofwtares\\RESTAURANT POS\\pos'

    try {
      const psScript = `$desktopPath = [Environment]::GetFolderPath("Desktop")\n$shortcutPath = Join-Path $desktopPath "Restaurant POS.lnk"\n$posDir = "${posDir}"\n\n$shell = New-Object -ComObject WScript.Shell\n$shortcut = $shell.CreateShortcut($shortcutPath)\n$shortcut.TargetPath = "cmd.exe"\n$shortcut.Arguments = "/c cd /d \\"$posDir\\" && npx electron ."\n$shortcut.Description = "Restaurant POS System"\n$shortcut.WorkingDirectory = $posDir\n$shortcut.Save()\n\nWrite-Output "Shortcut created"`
      const scriptPath = path.join(require('os').tmpdir(), `create-shortcut-${Date.now()}.ps1`)
      fs.writeFileSync(scriptPath, psScript, 'utf8')
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { encoding: 'utf8', stdio: 'pipe', timeout: 10000 })
      fs.unlinkSync(scriptPath)
      mainWindow.webContents.send('install-log', '✓ Desktop shortcut created')
    } catch (e) {
      mainWindow.webContents.send('install-log', 'Shortcut: ' + (e.message || 'unknown'))
    }

    // Launch POS application after brief delay
    setTimeout(() => {
      try {
        const posExePath = path.join(posDir, 'pos.exe')
        if (fs.existsSync(posExePath)) {
          execSync(`"${posExePath}"`, { detached: true, stdio: 'ignore', windowsHide: true })
        } else {
          execSync(`powershell -NoProfile -Command "cd '${posDir}'; npx electron ."`, { detached: true, stdio: 'ignore', windowsHide: true })
        }
        mainWindow.webContents.send('install-log', '✓ POS launching...')
      } catch (e) {
        mainWindow.webContents.send('install-log', 'POS launch: ' + e.message)
      }
    }, 2000)

    mainWindow.webContents.send('install-complete', {
      ip: serverIP,
      adminUrl: `http://${serverIP}:3001`,
      credentials: {
        username: 'admin',
        password: 'Admin@1234'
      }
    })

    // Close installer after 2 seconds
    setTimeout(() => {
      app.quit()
    }, 2000)
  } catch (error) {
    mainWindow.webContents.send('install-error', {
      step: 'unknown',
      message: error.message
    })
  }
}

const startTerminalInstallation = async (serverIP) => {
  const steps = 3

  try {
    // Step 1: Verify connection
    mainWindow.webContents.send('install-progress', {
      step: 1,
      total: steps,
      message: 'Verifying server connection...',
      status: 'running'
    })
    mainWindow.webContents.send('install-log', `Connecting to ${serverIP}:3001...`)

    try {
      const response = await fetch(`http://${serverIP}:3001/health`, { timeout: 5000 })
      if (!response.ok) throw new Error('Server not responding')
      mainWindow.webContents.send('install-log', 'Server connection verified')
    } catch (error) {
      throw new Error(`Cannot connect to server at ${serverIP}:3001`)
    }

    mainWindow.webContents.send('install-progress', {
      step: 1,
      total: steps,
      message: 'Server verified',
      status: 'done'
    })

    // Step 2: Install POS
    mainWindow.webContents.send('install-progress', {
      step: 2,
      total: steps,
      message: 'Installing POS app...',
      status: 'running'
    })
    await installPOS((msg) => {
      mainWindow.webContents.send('install-log', msg)
    })
    mainWindow.webContents.send('install-progress', {
      step: 2,
      total: steps,
      message: 'POS app installed',
      status: 'done'
    })

    // Step 3: Configure
    mainWindow.webContents.send('install-progress', {
      step: 3,
      total: steps,
      message: 'Configuring terminal...',
      status: 'running'
    })
    mainWindow.webContents.send('install-log', 'Creating terminal configuration...')

    // Write config file with outlet info
    const fs = require('fs')
    const os = require('os')
    const configPath = path.join(os.homedir(), 'AppData', 'Local', 'Restaurant POS', 'pos-config.json')

    try {
      const configDir = path.dirname(configPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      // Check if embedded config exists (created by setup-generator)
      let outletId = null
      let outletCode = null
      let brandName = null

      const embeddedConfigPath = path.join(__dirname, 'embedded-config.json')
      if (fs.existsSync(embeddedConfigPath)) {
        try {
          const embedded = JSON.parse(fs.readFileSync(embeddedConfigPath, 'utf8'))
          outletId = embedded.outletId
          outletCode = embedded.outletCode
          brandName = embedded.brandName
          mainWindow.webContents.send('install-log', `Loaded outlet config: ${outletCode}`)
        } catch (e) {
          mainWindow.webContents.send('install-log', 'Note: No outlet config found')
        }
      }

      fs.writeFileSync(configPath, JSON.stringify({
        outletId,
        outletCode,
        brandName,
        serverIP: serverIP,
        serverPort: 3001,
        machineId: `TERMINAL-${Date.now()}`,
        installedAt: new Date().toISOString()
      }, null, 2))

      mainWindow.webContents.send('install-log', 'Terminal configuration saved')
    } catch (error) {
      mainWindow.webContents.send('install-log', `Configuration warning: ${error.message}`)
    }

    mainWindow.webContents.send('install-progress', {
      step: 3,
      total: steps,
      message: 'Terminal configured',
      status: 'done'
    })

    mainWindow.webContents.send('install-complete', {
      serverIP: serverIP,
      outletCode: 'Not yet assigned'
    })
  } catch (error) {
    mainWindow.webContents.send('install-error', {
      step: 'setup',
      message: error.message
    })
  }
}
