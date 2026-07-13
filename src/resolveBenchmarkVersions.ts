import { createHash } from 'node:crypto'
import { appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { readBenchmarkVersions } from './benchmarkVersions.ts'

export interface VersionSelection {
  readonly hash: string
  readonly versions: readonly string[]
}

const parseExplicitVersions = (value: string): readonly string[] => {
  const versions = value
    .split(',')
    .map((version) => version.trim())
    .filter(Boolean)
  if (versions.length === 0) {
    throw new Error('VERSIONS must contain at least one version or tag')
  }
  return versions
}

const parseRecentVersionCount = (value: string, available: number): number => {
  if (!value) {
    return available
  }
  const count = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(count) || count < 1 || `${count}` !== value) {
    throw new Error('RECENT_VERSIONS must be a positive integer')
  }
  return count
}

export const selectBenchmarkVersions = (
  configuredVersions: readonly string[],
  environment: NodeJS.ProcessEnv,
): VersionSelection => {
  const explicitVersions = environment.VERSIONS?.trim()
  const versions = explicitVersions
    ? parseExplicitVersions(explicitVersions)
    : configuredVersions.slice(0, parseRecentVersionCount(environment.RECENT_VERSIONS?.trim() ?? '', configuredVersions.length))
  const serialized = versions.join(',')
  return {
    versions,
    hash: createHash('sha256').update(serialized).digest('hex'),
  }
}

export const resolveBenchmarkVersions = async (environment: NodeJS.ProcessEnv = process.env): Promise<VersionSelection> => {
  const configured = await readBenchmarkVersions()
  const selection = selectBenchmarkVersions(configured.versions, environment)
  const outputPath = environment.GITHUB_OUTPUT
  if (outputPath) {
    await appendFile(outputPath, `versions=${selection.versions.join(',')}\nhash=${selection.hash}\n`)
  }
  return selection
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  resolveBenchmarkVersions().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
