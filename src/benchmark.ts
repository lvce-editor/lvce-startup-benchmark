import { mkdir } from 'node:fs/promises'
import { prepareServerPackages } from './packageManager.ts'
import { startServer } from './server.ts'
import { measureStartup } from './measure.ts'
import { getRawResultPath, writeSummary, writeVersionResult } from './results.ts'
import { summarizeVersion } from './summary.ts'
import { countOpenFileDescriptors } from './fileDescriptors.ts'
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

export const runBenchmark = async (
  options: BenchmarkOptions,
  dependencies: BenchmarkDependencies = {},
): Promise<BenchmarkRunResult> => {
  const deps = { ...defaultDependencies, ...dependencies }
  await mkdir(options.output, { recursive: true })
  console.info(`[benchmark] preparing ${options.versions.length} server version${options.versions.length === 1 ? '' : 's'}`)
  const preparedServers = await deps.prepareServers(options.versions)
  const versionResults: VersionResult[] = []
  const summaries: VersionSummary[] = []
  for (const version of options.versions) {
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
        const result = await deps.measureStartup(version, prepared.safeVersion, iteration, warmup, running.url, options)
        results.push({
          ...result,
          serverOpenFileDescriptors: await countOpenFileDescriptors(running.process.pid),
        })
      }
    } finally {
      await running.stop()
    }
    const versionResult: VersionResult = {
      version,
      safeVersion: prepared.safeVersion,
      rawPath: getRawResultPath(options.output, prepared.safeVersion),
      serverStartupTimeMs: running.startupTimeMs,
      results,
    }
    await writeVersionResult(options.output, versionResult)
    versionResults.push(versionResult)
    summaries.push(summarizeVersion(version, results, running.startupTimeMs))
  }
  await writeSummary(options.output, summaries)
  return {
    versionResults,
    summaries,
  }
}
