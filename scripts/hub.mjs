import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { homedir, networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.PORT || 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`)
}
const httpsPort = Number(process.env.HTTPS_PORT || 3443)
if (!Number.isInteger(httpsPort) || httpsPort < 1 || httpsPort > 65535) {
  throw new Error(`Invalid HTTPS_PORT: ${process.env.HTTPS_PORT}`)
}

const hubDir = path.join(homedir(), '.econ-hub')
const defaultCertPath = path.join(hubDir, 'server.crt')
const defaultKeyPath = path.join(hubDir, 'server.key')
const certPath = process.env.HTTPS_CERT || defaultCertPath
const keyPath = process.env.HTTPS_KEY || defaultKeyPath
const caPath = process.env.HUB_CA_CERT || path.join(hubDir, 'ca.crt')
const caAvailable = existsSync(caPath)

const addresses = [...new Set(Object.values(networkInterfaces())
  .flatMap((items) => items ?? [])
  .filter((address) => !address.internal && (address.family === 'IPv4' || address.family === 4))
  .map((address) => address.address))]

if (certPath === defaultCertPath && keyPath === defaultKeyPath && existsSync(certPath) && addresses.length > 0) {
  const san = spawnSync('openssl', ['x509', '-in', certPath, '-noout', '-ext', 'subjectAltName'], {
    encoding: 'utf8',
  })
  if (san.status === 0) {
    const certificateAddresses = new Set(
      [...san.stdout.matchAll(/IP Address:([0-9.]+)/g)].map((match) => match[1])
    )
    const missing = addresses.filter((address) => !certificateAddresses.has(address))
    if (missing.length > 0) {
      console.log(`LAN address changed; renewing the hub server certificate for ${missing.join(', ')}.`)
      const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hub-cert.sh')
      const renewal = spawnSync('sh', [scriptPath], { stdio: 'inherit' })
      if (renewal.status !== 0) {
        throw renewal.error ?? new Error('Could not renew the hub server certificate.')
      }
    }
  } else {
    console.warn('Could not inspect the hub certificate SANs; continuing with the existing certificate.')
  }
}

const httpsEnabled = existsSync(certPath) && existsSync(keyPath)

console.log('\nEcon Coach classroom hub')
console.log(`  Local HTTP: http://127.0.0.1:${port}`)
if (httpsEnabled) console.log(`  Local HTTPS: https://localhost:${httpsPort}`)
if (caAvailable) console.log(`  Local CA: http://127.0.0.1:${port}/hub-ca.crt`)
for (const address of addresses) {
  console.log(`  LAN HTTP:   http://${address}:${port}`)
  if (httpsEnabled) {
    const lanUrl = `https://${address}:${httpsPort}`
    console.log(`  LAN HTTPS:  ${lanUrl}`)
    const qr = spawnSync('qrencode', ['-t', 'ANSIUTF8', lanUrl], { encoding: 'utf8' })
    if (qr.status === 0 && qr.stdout) console.log(qr.stdout)
  }
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
