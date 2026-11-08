const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('office', {
  floors: () => ipcRenderer.invoke('floors'),
  addFloor: () => ipcRenderer.invoke('add-floor'),
  removeFloor: id => ipcRenderer.invoke('remove-floor', id),
  run: (floor, task) => ipcRenderer.send('run', floor, task),
  stop: floor => ipcRenderer.send('stop', floor),
  answer: (floor, id, ok) => ipcRenderer.send('answer', floor, id, ok),
  on: cb => ipcRenderer.on('office', (_, e) => cb(e)),
});
