/** Narrow public endpoint settings bridge; account credentials stay in main. */
import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('productPlatform', {
  read: () => ipcRenderer.invoke('product:platform:read'),
  save: (value: unknown) => ipcRenderer.invoke('product:platform:save', value),
})
