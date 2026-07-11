import assert from 'node:assert/strict'
import test from 'node:test'
import { runCli } from '../src/main.ts'
import type { BenchmarkRunResult } from '../src/benchmark.ts'
import type { BenchmarkOptions, IterationResult } from '../src/types.ts'

const failedIteration: IterationResult = {
  version: '0.80.12',
  iteration: 1,
  warmup: false,
  success: false,
  url: 'http://localhost:3200/',
  wallTimeMs: 0,
  navigation: null,
  domNodeCount: null,
  domCounters: null,
  heapUsage: null,
  loadedResourceSizes: null,
  performanceMetrics: [],
  paintTimings: null,
  serverOpenFileDescriptors: null,
  error: 'page.goto: net::ERR_CONNECTION_REFUSED',
}

const failedRunResult: BenchmarkRunResult = {
  versionResults: [
    {
      version: '0.80.12',
      safeVersion: '0.80.12',
      rawPath: 'results/raw/0.80.12.json',
      serverStartupTimeMs: 0,
      results: [failedIteration],
    },
  ],
  summaries: [],
}

test('runCli exits successfully when a completed benchmark has failed versions', async () => {
  const originalExitCode = process.exitCode
  process.exitCode = undefined
  try {
    await runCli(['--versions', '0.80.12'], {
      runBenchmark: async (options: BenchmarkOptions): Promise<BenchmarkRunResult> => {
        assert.deepEqual(options.versions, ['0.80.12'])
        return failedRunResult
      },
    })
    assert.equal(process.exitCode, undefined)
  } finally {
    process.exitCode = originalExitCode
  }
})

test('runCli still rejects unexpected benchmark errors', async () => {
  await assert.rejects(
    runCli(['--versions', '0.80.12'], {
      runBenchmark: async (): Promise<BenchmarkRunResult> => {
        throw new Error('prepare failed')
      },
    }),
    /prepare failed/,
  )
})
