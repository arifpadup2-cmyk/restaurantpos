const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig:        () => ipcRenderer.invoke('get-config'),
  saveAndConnect:   (cfg) => ipcRenderer.invoke('save-and-connect', cfg),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
});
