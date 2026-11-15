import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'

const port = Number(process.env.PORT || 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`)
}

const addresses = Object.values(networkInterfaces())
  .flatMap((items) => items ?? [])
  .filter((address) => !address.internal && (address.family === 'IPv4' || address.family === 4))
  .map((address) => address.address)

console.log('\nEcon Coach classroom hub')
console.log(`  Local: http://127.0.0.1:${port}`)
for (const address of addresses) console.log(`  LAN:   http://${address}:${port}`)
if (addresses.length === 0) console.log('  LAN:   no non-loopback IPv4 address found')
console.log('  Keep this laptop and the phone on the same local network.\n')

const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, HOST: '0.0.0.0', PORT: String(port) },
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal))
}

server.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 0)
})
