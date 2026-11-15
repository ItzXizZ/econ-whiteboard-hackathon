import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir, networkInterfaces } from 'node:os'
import path from 'node:path'

const port = Number(process.env.PORT || 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`)
}
const httpsPort = Number(process.env.HTTPS_PORT || 3443)
if (!Number.isInteger(httpsPort) || httpsPort < 1 || httpsPort > 65535) {
  throw new Error(`Invalid HTTPS_PORT: ${process.env.HTTPS_PORT}`)
}

const hubDir = path.join(homedir(), '.econ-hub')
const certPath = process.env.HTTPS_CERT || path.join(hubDir, 'server.crt')
const keyPath = process.env.HTTPS_KEY || path.join(hubDir, 'server.key')
const caPath = process.env.HUB_CA_CERT || path.join(hubDir, 'ca.crt')
const httpsEnabled = existsSync(certPath) && existsSync(keyPath)
const caAvailable = existsSync(caPath)

const addresses = [...new Set(Object.values(networkInterfaces())
  .flatMap((items) => items ?? [])
  .filter((address) => !address.internal && (address.family === 'IPv4' || address.family === 4))
  .map((address) => address.address))]

console.log('\nEcon Coach classroom hub')
console.log(`  Local HTTP: http://127.0.0.1:${port}`)
if (httpsEnabled) console.log(`  Local HTTPS: https://localhost:${httpsPort}`)
if (caAvailable) console.log(`  Local CA: http://127.0.0.1:${port}/hub-ca.crt`)
for (const address of addresses) {
  console.log(`  LAN HTTP:   http://${address}:${port}`)
  if (httpsEnabled) console.log(`  LAN HTTPS:  https://${address}:${httpsPort}`)
  if (caAvailable) console.log(`  Install CA: http://${address}:${port}/hub-ca.crt`)
}
if (addresses.length === 0) console.log('  LAN:   no non-loopback IPv4 address found')
if (!httpsEnabled) console.log('  HTTPS: run npm run hub:cert to create a local certificate first.')
console.log('  Keep this laptop and the phone on the same local network.\n')

const childEnv = { ...process.env, HOST: '0.0.0.0', PORT: String(port) }
if (httpsEnabled) {
  childEnv.HTTPS_CERT = certPath
  childEnv.HTTPS_KEY = keyPath
  childEnv.HTTPS_PORT = String(httpsPort)
  if (caAvailable) childEnv.HUB_CA_CERT = caPath
} else {
  delete childEnv.HTTPS_CERT
  delete childEnv.HTTPS_KEY
  delete childEnv.HTTPS_PORT
}

const server = spawn(process.execPath, ['server.js'], {
  env: childEnv,
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal))
}

server.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 0)
})
