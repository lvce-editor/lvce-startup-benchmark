import { pathToFileURL } from 'node:url'
import { parseArgs } from './cli.ts'
import { runBenchmark } from './benchmark.ts'
import { getRecentPublishedVersions } from './versions.ts'

export interface CliDependencies {
  readonly getRecentPublishedVersions?: typeof getRecentPublishedVersions
  readonly runBenchmark?: typeof runBenchmark
}

export const runCli = async (argv: readonly string[], dependencies: CliDependencies = {}): Promise<void> => {
  const deps = {
    getRecentPublishedVersions,
    runBenchmark,
    ...dependencies,
  }
  const options = parseArgs(argv)
  const versions = options.recentVersions === null ? options.versions : await deps.getRecentPublishedVersions(options.recentVersions)
  await deps.runBenchmark({ ...options, versions })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
