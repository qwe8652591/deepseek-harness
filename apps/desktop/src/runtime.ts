/** Independent Node entrypoint for the desktop-local Harness host. */
import { createRequire } from 'node:module'
import { loadLayeredEnv } from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { runProfile, type RunProfileOptions } from '@deepseek-ai/dsh/profile-boot'
import type { RuntimeMessage } from './protocol.ts'

const LOOPBACK_HOST = '127.0.0.1'

/** Resolve the installed bundle patch without assuming a source checkout. */
function bidBundlePatch(): string {
  return createRequire(import.meta.url).resolve('@deepseek-ai/dsh-bid-studio-bundle/cordis.patch.yml')
}

/** Notify the Electron supervisor when the Web host is ready. */
function send(message: RuntimeMessage): void {
  if (process.send !== undefined) process.send(message)
}

/** Run until the supervisor disconnects or requests orderly shutdown. */
async function main(): Promise<void> {
  const options: RunProfileOptions = {
    environment: loadLayeredEnv('dsh-desktop'),
    profile: 'web',
    patchFiles: [bidBundlePatch()],
    args: ['--host', LOOPBACK_HOST, '--port', '0'],
    watchUserPatches: false,
  }
  const runtime = await runProfile(options)
  const port = runtime.ctx.get('webServer')?.port
  if (port === undefined) throw new Error('dsh-desktop-runtime: Web server did not publish its bound port')

  let stopping = false
  const stop = async (): Promise<void> => {
    if (stopping) return
    stopping = true
    await runtime.shutdown.shutdown(0)
    process.exitCode = 0
  }
  process.on('message', (message: unknown) => {
    if (message !== null && typeof message === 'object' && 'type' in message && message.type === 'shutdown') void stop()
  })
  process.once('disconnect', () => { void stop() })
  process.once('SIGINT', () => { void stop() })
  process.once('SIGTERM', () => { void stop() })
  send({ type: 'ready', url: `http://${LOOPBACK_HOST}:${String(port)}` })
}

void main().catch((error: unknown) => {
  process.stderr.write(`dsh-desktop-runtime: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
