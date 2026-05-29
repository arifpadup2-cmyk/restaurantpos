const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('installAPI', {
  checkSystem: () => ipcRenderer.invoke('check-system'),
  startInstall: (config) => ipcRenderer.invoke('start-install', config),
  onProgress: (callback) => ipcRenderer.on('install-progress', (event, data) => callback(data)),
  onLog: (callback) => ipcRenderer.on('install-log', (event, data) => callback(data)),
  onComplete: (callback) => ipcRenderer.on('install-complete', (event, data) => callback(data)),
  onError: (callback) => ipcRenderer.on('install-error', (event, data) => callback(data)),
  removeListeners: () => {
    ipcRenderer.removeAllListeners('install-progress')
    ipcRenderer.removeAllListeners('install-log')
    ipcRenderer.removeAllListeners('install-complete')
    ipcRenderer.removeAllListeners('install-error')
  }
})
