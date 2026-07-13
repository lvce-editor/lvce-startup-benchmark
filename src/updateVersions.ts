import { pathToFileURL } from 'node:url'
import { defaultBenchmarkVersionCount, writeBenchmarkVersions } from './benchmarkVersions.ts'
import { getRecentPublishedVersions } from './versions.ts'

const parseCount = (args: readonly string[]): number => {
  if (args.length === 0) {
    return defaultBenchmarkVersionCount
  }
  if (args.length !== 2 || args[0] !== '--count') {
    throw new Error('Usage: npm run update-versions -- [--count <number>]')
  }
  const count = Number.parseInt(args[1] ?? '', 10)
  if (!Number.isSafeInteger(count) || count < 1 || `${count}` !== args[1]) {
    throw new Error('--count must be a positive integer')
  }
  return count
}

export const updateVersions = async (args: readonly string[]): Promise<void> => {
  const versions = await getRecentPublishedVersions(parseCount(args))
  await writeBenchmarkVersions(versions)
  console.info(`Updated versions.json with ${versions.length} versions`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  updateVersions(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
