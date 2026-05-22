const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

let mainWindow;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}
function readConfig() {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')); }
  catch { return {}; }
}
function writeConfig(obj) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(obj, null, 2));
}

function loadSetup(errorMsg) {
  let url = 'file://' + path.join(__dirname, 'setup.html');
  if (errorMsg) url += '?error=' + encodeURIComponent(errorMsg);
  mainWindow.loadURL(url);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 900, minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    title: 'Restaurant Waiter',
  });

  const cfg = readConfig();
  if (cfg.serverIp) {
    mainWindow.loadURL(`http://${cfg.serverIp}:3001/waiter-app/`);
  } else {
    loadSetup();
  }

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    if (code !== -3) loadSetup(`Cannot reach server: ${desc}`);
  });
}

ipcMain.handle('get-config', () => readConfig());

ipcMain.handle('save-and-connect', (_e, cfg) => {
  writeConfig(cfg);
  mainWindow.loadURL(`http://${cfg.serverIp}:3001/waiter-app/`);
  return { ok: true };
});

ipcMain.handle('toggle-fullscreen', () => {
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
