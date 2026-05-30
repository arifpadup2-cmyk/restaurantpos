const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posAPI', {
  db: {
    all:  (sql, params) => ipcRenderer.invoke('db-all', sql, params),
    get:  (sql, params) => ipcRenderer.invoke('db-get', sql, params),
    run:  (sql, params) => ipcRenderer.invoke('db-run', sql, params),
    tx:   (ops)         => ipcRenderer.invoke('db-tx',  ops),
  },
  getPrinters:      () => ipcRenderer.invoke('get-printers'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  quitApp:          () => ipcRenderer.invoke('quit-app'),
  getMachineId:     () => ipcRenderer.invoke('get-machine-id'),
  getCloudApiUrl:   () => ipcRenderer.invoke('get-cloud-api-url'),
  getAppVersion:    () => ipcRenderer.invoke('get-app-version'),
  getConfig:        () => ipcRenderer.invoke('get-config'),
  saveConfig:       (cfg) => ipcRenderer.invoke('save-config', cfg),
  testConnection:   (cfg) => ipcRenderer.invoke('test-connection', cfg),
  notifyServer:     (event, payload) => ipcRenderer.invoke('notify-server', event, payload),
  onUpdateAvailable:    (cb) => ipcRenderer.on('update-available', (_e, info) => cb(info)),
  onDownloadProgress:   (cb) => ipcRenderer.on('download-progress', (_e, prog) => cb(prog)),
  onUpdateReady:        (cb) => ipcRenderer.on('update-ready', cb),
  checkForUpdates:      () => ipcRenderer.invoke('check-for-updates'),
  startUpdateDownload:  () => ipcRenderer.invoke('start-update-download'),
  installUpdate:        () => ipcRenderer.invoke('install-update'),
  reloadApp:        () => ipcRenderer.invoke('reload-app'),
  openExternal:     (url) => ipcRenderer.invoke('open-external', url),
  print: {
    receipt: (data) => ipcRenderer.invoke('print-receipt', data),
    kot:     (data) => ipcRenderer.invoke('print-kot',     data),
  },
});
