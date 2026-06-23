import { spawn } from 'node:child_process'
import { request } from 'node:http'
import type { PreparedServer, RunningServer } from './types.ts'
import { findFreePort } from './ports.ts'

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const checkHttp = async (url: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const req = request(url, { method: 'GET', timeout: 1000 }, (res) => {
      res.resume()
      resolve(Boolean(res.statusCode && res.statusCode < 500))
    })
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.on('error', () => {
      resolve(false)
    })
    req.end()
  })
}

const stopProcess = async (pid: number | undefined): Promise<void> => {
  if (!pid) {
    return
  }
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'])
      return
    }
    process.kill(-pid, 'SIGTERM')
  } catch {
    // Process may already be gone.
  }
  await wait(500)
  try {
    if (process.platform !== 'win32') {
      process.kill(-pid, 'SIGKILL')
    }
  } catch {
    // Process may already be gone.
  }
}

export const startServer = async (
  prepared: PreparedServer,
  options: { readonly workspace: string; readonly portBase: number; readonly timeout: number; readonly urlPath: string },
): Promise<RunningServer> => {
  const port = await findFreePort(options.portBase)
  const baseUrl = `http://localhost:${port}`
  const url = new URL(options.urlPath, baseUrl).toString()
  const child = spawn(prepared.binaryPath, [...(prepared.binaryArgs ?? []), options.workspace], {
    cwd: prepared.packageDir,
    env: { ...process.env, PORT: String(port) },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout?.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    output += String(chunk)
  })
  child.on('error', (error) => {
    output += `\n${error.stack || error.message}`
  })

  const start = Date.now()
  while (Date.now() - start < options.timeout) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before startup for ${prepared.version}\n${output}`)
    }
    if (output.includes('listening on') || (await checkHttp(baseUrl))) {
      return {
        port,
        url,
        process: child,
        stop: () => stopProcess(child.pid),
      }
    }
    await wait(250)
  }
  await stopProcess(child.pid)
  throw new Error(`Timed out waiting for server ${prepared.version} on ${baseUrl}\n${output}`)
}
