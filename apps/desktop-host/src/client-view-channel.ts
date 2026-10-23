/** Request/answer channel from the Host to the Electron shell's offscreen client view over the process IPC. */

/** Longest a single view operation may take, including loading the page on `open`. */
export const CLIENT_VIEW_REQUEST_TIMEOUT_MS = 60_000

/** Host side of the channel. */
export interface ClientViewChannel {
  /**
   * Send one request and await the shell's answer.
   * @param request - view operation; the shell validates it.
   * @returns the shell's value; rejects with the shell's error message, on timeout, or when IPC is gone.
   */
  request(request: Record<string, unknown>): Promise<unknown>
  /**
   * Deliver a `client-view-result` message from the shell.
   * @param message - untrusted IPC message.
   */
  receive(message: object): void
}

/**
 * @param send - delivers one message to the shell; resolves once IPC accepted it and rejects when the shell is gone.
 * @param timeoutMs - per-request deadline.
 * @returns the channel.
 */
export function createClientViewChannel(
  send: (message: object) => Promise<void>, timeoutMs = CLIENT_VIEW_REQUEST_TIMEOUT_MS,
): ClientViewChannel {
  let nextId = 1
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  return {
    request: (request) => {
      const requestId = nextId++
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId)
          reject(new Error('client view: the desktop shell did not answer in time'))
        }, timeoutMs)
        pending.set(requestId, {
          resolve: (value) => { clearTimeout(timer); resolve(value) },
          reject: (error) => { clearTimeout(timer); reject(error) },
        })
        send({ type: 'client-view', requestId, request }).catch((error: unknown) => {
          pending.delete(requestId)
          clearTimeout(timer)
          reject(error instanceof Error ? error : new Error(String(error)))
        })
      })
    },
    receive: (message) => {
      const answer = message as { requestId?: unknown; value?: unknown; error?: unknown }
      if (typeof answer.requestId !== 'number') return
      const waiter = pending.get(answer.requestId)
      if (waiter === undefined) return
      pending.delete(answer.requestId)
      if (typeof answer.error === 'string') waiter.reject(new Error(answer.error))
      else waiter.resolve(answer.value)
    },
  }
}
