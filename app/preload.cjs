const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('office', {
  pick: () => ipcRenderer.invoke('pick'),
  run: task => ipcRenderer.send('run', task),
  stop: () => ipcRenderer.send('stop'),
  answer: (id, ok) => ipcRenderer.send('answer', id, ok),
  on: cb => ipcRenderer.on('office', (_, e) => cb(e)),
});
