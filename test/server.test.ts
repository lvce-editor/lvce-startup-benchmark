import assert from 'node:assert/strict'
import test from 'node:test'
import { startServer } from '../src/server.ts'
import type { PreparedServer } from '../src/types.ts'

test('startServer observes listening output without a polling delay', async () => {
  const prepared: PreparedServer = {
    version: 'instant-output',
    safeVersion: 'instant-output',
    packageDir: process.cwd(),
    binaryPath: process.execPath,
    binaryArgs: ['--eval', `console.log('listening on'); setInterval(() => undefined, 1000)`],
  }
  const running = await startServer(prepared, {
    workspace: process.cwd(),
    portBase: 53_000,
    timeout: 2000,
    urlPath: '/',
  })
  try {
    assert.ok(running.startupTimeMs < 200, `Expected event-driven readiness in under 200 ms, got ${running.startupTimeMs} ms`)
  } finally {
    await running.stop()
  }
})
