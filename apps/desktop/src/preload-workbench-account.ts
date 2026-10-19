/** Account-only preload for the owned welcome window. */
import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('workbenchBrowserAccount', {
  locale: () => ipcRenderer.invoke('workbench:account:locale'),
  login: () => ipcRenderer.invoke('workbench:account:login'),
  cancel: () => ipcRenderer.invoke('workbench:account:cancel'),
  platform: () => ipcRenderer.invoke('workbench:account:platform'),
})
