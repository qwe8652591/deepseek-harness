/**
 * Boots the way a profile process does — {@link installProxyFromEnvironment} with no proxy exported,
 * before any module has imported `undici` — then reads one response whose body ends when the server
 * closes the connection. Prints the number of characters read.
 *
 * The body is sized so it and the FIN arrive in one socket read, and it is read only after a delay.
 * Node's built-in undici (7.x) pauses the parser on that read and then throws `assert(!this.paused)` from the socket 'end' handler, an
 * uncaught exception that exits this process before anything is printed.
 */
import { createServer, type AddressInfo } from 'node:net'
import { installProxyFromEnvironment } from '../../src/index.ts'

const body = 'a'.repeat(50_000)
const server = createServer((socket) => {
  socket.once('data', () => {
    socket.write('HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n')
    socket.end(body)
  })
})
await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
const { port } = server.address() as AddressInfo

const dispose = await installProxyFromEnvironment({ get: () => undefined }, (message: string) => { process.stderr.write(`${message}\n`) })
try {
  const response = await fetch(`http://127.0.0.1:${String(port)}/`)
  // A caller that does other work before reading: the body arrives while nothing consumes it.
  await new Promise((resolve) => { setTimeout(resolve, 50) })
  process.stdout.write(String((await response.text()).length))
} finally {
  await dispose()
  server.close()
}
