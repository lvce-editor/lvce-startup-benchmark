import { mkdir } from 'node:fs/promises'
import { prepareServerPackages } from './packageManager.ts'
import { startServer } from './server.ts'
import { measureStartup } from './measure.ts'
import { getRawResultPath, writeSummary, writeVersionResult } from './results.ts'
import { summarizeVersion } from './summary.ts'
import { baselineVersion, getBaselinePreparedServer } from './baseline.ts'
import type { BenchmarkOptions, IterationResult, PreparedServer, RunningServer, VersionResult, VersionSummary } from './types.ts'

export interface BenchmarkDependencies {
  readonly prepareServers?: (versions: readonly string[]) => Promise<ReadonlyMap<string, PreparedServer>>
  readonly startServer?: (prepared: PreparedServer, options: BenchmarkOptions) => Promise<RunningServer>
  readonly measureStartup?: (
    version: string,
    safeVersion: string,
    iteration: number,
    warmup: boolean,
    url: string,
    options: BenchmarkOptions,
  ) => Promise<IterationResult>
}

export interface BenchmarkRunResult {
  readonly versionResults: readonly VersionResult[]
  readonly summaries: readonly VersionSummary[]
}

const defaultDependencies: Required<BenchmarkDependencies> = {
  prepareServers: (versions) => prepareServerPackages(versions),
  startServer: (prepared, options) => startServer(prepared, options),
  measureStartup,
}

const getBenchmarkVersions = (options: BenchmarkOptions): readonly string[] => {
  if (!options.baseline) {
    return options.versions
  }
  if (options.versions.includes(baselineVersion)) {
    throw new Error(`--baseline cannot be used when --versions includes "${baselineVersion}"`)
  }
  return [baselineVersion, ...options.versions]
}

const getPreparedServers = async (
  options: BenchmarkOptions,
  prepareServers: (versions: readonly string[]) => Promise<ReadonlyMap<string, PreparedServer>>,
): Promise<ReadonlyMap<string, PreparedServer>> => {
  const appPreparedServers = await prepareServers(options.versions)
  if (!options.baseline) {
    return appPreparedServers
  }
  return new Map<string, PreparedServer>([[baselineVersion, getBaselinePreparedServer()], ...appPreparedServers])
}

export const runBenchmark = async (
  options: BenchmarkOptions,
  dependencies: BenchmarkDependencies = {},
): Promise<BenchmarkRunResult> => {
  const deps = { ...defaultDependencies, ...dependencies }
  const benchmarkVersions = getBenchmarkVersions(options)
  await mkdir(options.output, { recursive: true })
  console.info(`[benchmark] preparing ${options.versions.length} server version${options.versions.length === 1 ? '' : 's'}`)
  const preparedServers = await getPreparedServers(options, deps.prepareServers)
  const versionResults: VersionResult[] = []
  const summaries: VersionSummary[] = []
  for (const version of benchmarkVersions) {
    const prepared = preparedServers.get(version)
    if (!prepared) {
      throw new Error(`Missing prepared server for ${version}`)
    }
    console.info(`[benchmark] starting server for ${version}`)
    const running = await deps.startServer(prepared, options)
    const results: IterationResult[] = []
    try {
      const total = options.warmups + options.iterations
      for (let index = 0; index < total; index++) {
        const warmup = index < options.warmups
        const iteration = warmup ? index + 1 : index - options.warmups + 1
        console.info(`[benchmark] ${version} ${warmup ? 'warmup' : 'iteration'} ${iteration}`)
        results.push(await deps.measureStartup(version, prepared.safeVersion, iteration, warmup, running.url, options))
      }
    } finally {
      await running.stop()
    }
    const versionResult: VersionResult = {
      version,
      safeVersion: prepared.safeVersion,
      rawPath: getRawResultPath(options.output, prepared.safeVersion),
      results,
    }
    await writeVersionResult(options.output, versionResult)
    versionResults.push(versionResult)
    summaries.push(summarizeVersion(version, results))
  }
  await writeSummary(options.output, summaries)
  return {
    versionResults,
    summaries,
  }
}

export const hasVersionThatFailedAllIterations = (runResult: BenchmarkRunResult): boolean => {
  return runResult.versionResults.some((versionResult) => {
    const measured = versionResult.results.filter((result) => !result.warmup)
    return measured.length > 0 && measured.every((result) => !result.success)
  })
}
