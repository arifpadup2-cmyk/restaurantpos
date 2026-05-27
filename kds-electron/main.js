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

function buildServerUrl(cfg) {
  if (cfg.connectionMode === 'cloud' && cfg.cloudServerUrl) {
    return cfg.cloudServerUrl.replace(/\/+$/, '');
  }
  if (cfg.serverIp) return `http://${cfg.serverIp}:3001`;
  return null;
}

function loadSetup(errorMsg) {
  let url = 'file://' + path.join(__dirname, 'setup.html');
  if (errorMsg) url += '?error=' + encodeURIComponent(errorMsg);
  mainWindow.setFullScreen(false);
  mainWindow.loadURL(url);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920, height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    title: 'Restaurant KDS',
  });

  const cfg = readConfig();
  const url = buildServerUrl(cfg);
  if (url) {
    mainWindow.loadURL(url + '/kds/');
    mainWindow.setFullScreen(true);
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
  const url = buildServerUrl(cfg);
  if (!url) return { ok: false, error: 'No server configured' };
  mainWindow.loadURL(url + '/kds/');
  mainWindow.setFullScreen(true);
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
