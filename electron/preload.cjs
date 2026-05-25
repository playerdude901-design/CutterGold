const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectVideo: () => ipcRenderer.invoke('select-video'),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  exportClips: (data) => ipcRenderer.invoke('export-clips', data),
  onExportProgress: (callback) => ipcRenderer.on('export-progress', (_event, value) => callback(value))
});
