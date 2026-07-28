import { spawn, type ChildProcess } from 'node:child_process'
import { connect } from 'node:net'
import type { PreparedServer, RunningServer } from './types.ts'
import { findFreePort } from './ports.ts'

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const checkTcp = async (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = connect({ host: 'localhost', port }, () => {
      socket.end()
      resolve(true)
    })
    socket.setTimeout(1000, () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => {
      resolve(false)
    })
  })
}

const waitForExit = async (child: ChildProcess, timeout: number): Promise<boolean> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', handleExit)
      resolve(false)
    }, timeout)
    const handleExit = (): void => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', handleExit)
  })
}

const stopProcess = async (child: ChildProcess): Promise<void> => {
  if (!child.pid) {
    return
  }
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
    } else {
      process.kill(-child.pid, 'SIGTERM')
    }
  } catch {
    // Process may already be gone.
  }
  if (await waitForExit(child, 500)) {
    return
  }
  try {
    if (process.platform !== 'win32') {
      process.kill(-child.pid, 'SIGKILL')
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
  const start = performance.now()
  const child = spawn(prepared.binaryPath, [...(prepared.binaryArgs ?? []), options.workspace], {
    cwd: prepared.packageDir,
    env: { ...process.env, PORT: String(port) },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const { promise: outputReady, resolve: resolveOutputReady } = Promise.withResolvers<boolean>()
  child.stdout?.on('data', (chunk) => {
    output += String(chunk)
    if (output.includes('listening on')) {
      resolveOutputReady(true)
    }
  })
  child.stderr?.on('data', (chunk) => {
    output += String(chunk)
    if (output.includes('listening on')) {
      resolveOutputReady(true)
    }
  })
  child.on('error', (error) => {
    output += `\n${error.stack || error.message}`
  })

  while (performance.now() - start < options.timeout) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Server exited before startup for ${prepared.version}\n${output}`)
    }
    const ready = await Promise.race([outputReady, checkTcp(port)])
    if (ready) {
      return {
        port,
        url,
        process: child,
        startupTimeMs: performance.now() - start,
        stop: () => stopProcess(child),
      }
    }
    const readyDuringWait = await Promise.race([outputReady, wait(10).then(() => false)])
    if (readyDuringWait) {
      return {
        port,
        url,
        process: child,
        startupTimeMs: performance.now() - start,
        stop: () => stopProcess(child),
      }
    }
  }
  await stopProcess(child)
  throw new Error(`Timed out waiting for server ${prepared.version} on ${baseUrl}\n${output}`)
}
