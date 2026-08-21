/** IPC messages exchanged by the Electron supervisor and local runtime. */
export type RuntimeMessage =
  | { readonly type: 'ready'; readonly url: string }
  | { readonly type: 'shutdown' }
