import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const viteEntry = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const api = spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' })
const vite = spawn(process.execPath, [viteEntry, ...process.argv.slice(2)], { stdio: 'inherit' })
let stopping = false

function stop(code = 0) {
  if (stopping) return
  stopping = true
  api.kill('SIGTERM')
  vite.kill('SIGTERM')
  process.exitCode = code
}

api.on('error', (error) => {
  console.error('Could not start the quote API:', error.message)
  stop(1)
})

vite.on('error', (error) => {
  console.error('Could not start Vite:', error.message)
  stop(1)
})

api.on('exit', (code) => {
  if (!stopping && code !== 0) stop(code || 1)
})

vite.on('exit', (code) => {
  if (!stopping && code !== 0) stop(code || 1)
})

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
