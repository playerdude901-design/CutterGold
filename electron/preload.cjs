const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectVideo: () => ipcRenderer.invoke('select-video'),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  getStreamUrl: (url) => ipcRenderer.invoke('get-stream-url', url),
  exportClips: (data) => ipcRenderer.invoke('export-clips', data),
  onExportProgress: (callback) => ipcRenderer.on('export-progress', (_event, value) => callback(value))
});
