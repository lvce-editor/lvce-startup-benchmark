import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runBenchmark } from '../src/benchmark.ts'
import { baselineVersion } from '../src/baseline.ts'
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
  baseline: false,
})

const getSuccessfulResult = (
  version: string,
  iteration: number,
  warmup: boolean,
  url: string,
  loadEventEnd = 120,
): IterationResult => ({
  version,
  iteration,
  warmup,
  success: true,
  url,
  wallTimeMs: loadEventEnd + 3,
  navigation: {
    startTime: 0,
    domInteractive: 10,
    domContentLoadedEventEnd: 20,
    loadEventEnd,
    responseEnd: 5,
    duration: loadEventEnd,
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
  paintTimings: {
    firstPaintMs: 30,
    firstContentfulPaintMs: 40,
    largestContentfulPaintMs: 50,
  },
  serverOpenFileDescriptors: null,
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
      process: { pid: process.pid } as RunningServer['process'],
      startupTimeMs: 45,
      stop: async () => undefined,
    }
    const measureStartup = async (version: string, _safeVersion: string, iteration: number, warmup: boolean, url: string): Promise<IterationResult> =>
      getSuccessfulResult(version, iteration, warmup, url)
    const result = await runBenchmark(getOptions(dir), {
      prepareServers: async () => new Map([[prepared.version, prepared]]),
      startServer: async () => running,
      measureStartup,
    })
    assert.equal(result.summaries[0]?.loadTimeMs.mean, 120)
    assert.equal(result.summaries[0]?.serverStartupTimeMs.mean, 45)
    assert.equal(result.summaries[0]?.firstPaintMs.mean, 30)
    assert.equal(result.summaries[0]?.firstContentfulPaintMs.mean, 40)
    assert.equal(result.summaries[0]?.largestContentfulPaintMs.mean, 50)
    assert.equal(result.summaries[0]?.transferSize.mean, 600)
    assert.equal(result.summaries[0]?.scriptDurationMs.mean, 12)
    const raw = JSON.parse(await readFile(join(dir, 'raw', 'mock-version.json'), 'utf8')) as {
      readonly serverStartupTimeMs: number
      readonly results: readonly unknown[]
    }
    assert.equal(raw.serverStartupTimeMs, 45)
    assert.equal(raw.results.length, 2)
    assert.equal(typeof (raw.results[1] as { readonly serverOpenFileDescriptors: unknown }).serverOpenFileDescriptors, 'number')
    const summary = await readFile(join(dir, 'summary.md'), 'utf8')
    assert.match(summary, /mock-version/)
    assert.match(summary, /Server Startup ms/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runBenchmark prepends baseline and prepares only app versions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lvce-startup-benchmark-'))
  try {
    const appPrepared: PreparedServer = {
      version: 'mock-version',
      safeVersion: 'mock-version',
      packageDir: dir,
      binaryPath: 'server',
    }
    const preparedInputs: string[][] = []
    const startedVersions: string[] = []
    const measuredVersions: string[] = []
    const result = await runBenchmark(
      {
        ...getOptions(dir),
        baseline: true,
      },
      {
        prepareServers: async (versions) => {
          preparedInputs.push([...versions])
          return new Map([[appPrepared.version, appPrepared]])
        },
        startServer: async (prepared) => {
          startedVersions.push(prepared.version)
          return {
            port: prepared.version === baselineVersion ? 3554 : 3555,
            url: `http://localhost:${prepared.version === baselineVersion ? 3554 : 3555}/`,
            process: {} as RunningServer['process'],
            startupTimeMs: prepared.version === baselineVersion ? 5 : 45,
            stop: async () => undefined,
          }
        },
        measureStartup: async (version, _safeVersion, iteration, warmup, url) => {
          measuredVersions.push(version)
          return getSuccessfulResult(version, iteration, warmup, url, version === baselineVersion ? 12 : 120)
        },
      },
    )

    assert.deepEqual(preparedInputs, [['mock-version']])
    assert.deepEqual(startedVersions, [baselineVersion, 'mock-version'])
    assert.deepEqual(measuredVersions, [baselineVersion, baselineVersion, 'mock-version', 'mock-version'])
    assert.deepEqual(result.summaries.map((summary) => summary.version), [baselineVersion, 'mock-version'])
    assert.equal(result.summaries[0]?.loadTimeMs.mean, 12)
    assert.equal(result.summaries[1]?.loadTimeMs.mean, 120)
    assert.match(await readFile(join(dir, 'raw', 'baseline.json'), 'utf8'), /"version": "baseline"/)
    assert.match(await readFile(join(dir, 'summary.md'), 'utf8'), /baseline/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runBenchmark rejects duplicate baseline version', async () => {
  await assert.rejects(
    runBenchmark({
      ...getOptions('results'),
      versions: [baselineVersion],
      baseline: true,
    }),
    /--baseline cannot be used/,
  )
})
