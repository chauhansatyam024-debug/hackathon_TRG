const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    setToken: (token) => ipcRenderer.send('set-token', token),
    onUploadStatus: (callback) => ipcRenderer.on('upload-status', (_event, data) => callback(data)),
    rescan: () => ipcRenderer.send('manual-rescan')
});
