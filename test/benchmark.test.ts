import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runBenchmark } from '../src/benchmark.ts'
import type { BenchmarkOptions, IterationResult, PreparedServer, RunningServer } from '../src/types.ts'

const getOptions = (output: string): BenchmarkOptions => ({
  versions: ['mock-version'],
  recentVersions: null,
  iterations: 1,
  warmups: 1,
  timeout: 1000,
  portBase: 3500,
  workspace: process.cwd(),
  urlPath: '/',
  output,
  profile: false,
  headed: false,
  browser: 'chromium',
})

test('runBenchmark writes raw and summary files with mocked server lifecycle', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lvce-startup-benchmark-'))
  try {
    const prepared: PreparedServer = {
      version: 'mock-version',
      safeVersion: 'mock-version',
      packageDir: dir,
      binaryPath: 'server',
    }
    const running: RunningServer = {
      port: 3555,
      url: 'http://localhost:3555/',
      process: {} as RunningServer['process'],
      stop: async () => undefined,
    }
    const measureStartup = async (
      version: string,
      _safeVersion: string,
      iteration: number,
      warmup: boolean,
      url: string,
    ): Promise<IterationResult> => ({
      version,
      iteration,
      warmup,
      success: true,
      url,
      wallTimeMs: 123,
      navigation: {
        startTime: 0,
        domInteractive: 10,
        domContentLoadedEventEnd: 20,
        loadEventEnd: 120,
        responseEnd: 5,
        duration: 120,
        transferSize: 1,
        encodedBodySize: 1,
        decodedBodySize: 1,
      },
      domNodeCount: 42,
      domCounters: {
        documents: 1,
        nodes: 42,
        jsEventListeners: 7,
      },
      heapUsage: {
        usedSize: 1000,
        totalSize: 2000,
      },
      loadedResourceSizes: {
        resources: 3,
        transferSize: 600,
        encodedBodySize: 500,
        decodedBodySize: 900,
      },
      performanceMetrics: [
        { name: 'ScriptDuration', value: 0.012 },
        { name: 'TaskDuration', value: 0.034 },
      ],
    })
    const result = await runBenchmark(getOptions(dir), {
      prepareServers: async () => new Map([[prepared.version, prepared]]),
      startServer: async () => running,
      measureStartup,
    })
    assert.equal(result.summaries[0]?.loadTimeMs.mean, 120)
    assert.equal(result.summaries[0]?.transferSize.mean, 600)
    assert.equal(result.summaries[0]?.scriptDurationMs.mean, 12)
    const raw = JSON.parse(await readFile(join(dir, 'raw', 'mock-version.json'), 'utf8')) as { readonly results: readonly unknown[] }
    assert.equal(raw.results.length, 2)
    const summary = await readFile(join(dir, 'summary.md'), 'utf8')
    assert.match(summary, /mock-version/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
