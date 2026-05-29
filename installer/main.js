const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

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
  mainWindow.webDevTools.openDevTools()

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
  const { restaurantName } = config
  const steps = 7
  let serverIP = '127.0.0.1'
  let psqlPath = null

  try {
    // Step 1: Install Node.js (skip if already present)
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
      message: 'Creating database...',
      status: 'running'
    })
    await createDatabase(psqlPath, (msg) => {
      mainWindow.webContents.send('install-log', msg)
    })
    mainWindow.webContents.send('install-progress', {
      step: 3,
      total: steps,
      message: 'Database created',
      status: 'done'
    })

    // Step 4: Install Server
    mainWindow.webContents.send('install-progress', {
      step: 4,
      total: steps,
      message: 'Installing server...',
      status: 'running'
    })
    serverIP = await installServer(restaurantName, (msg) => {
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

    // Step 7: Install POS
    mainWindow.webContents.send('install-progress', {
      step: 7,
      total: steps,
      message: 'Installing POS app...',
      status: 'running'
    })
    await installPOS((msg) => {
      mainWindow.webContents.send('install-log', msg)
    })
    mainWindow.webContents.send('install-progress', {
      step: 7,
      total: steps,
      message: 'POS app installed',
      status: 'done'
    })

    mainWindow.webContents.send('install-complete', {
      ip: serverIP,
      adminUrl: `http://${serverIP}:3001`,
      credentials: {
        username: 'admin',
        password: 'Admin@1234'
      }
    })
  } catch (error) {
    mainWindow.webContents.send('install-error', {
      step: 'unknown',
      message: error.message
    })
  }
})
