import { runCommand } from './process.ts'

export const serverPackageName = '@lvce-editor/server'

type NpmPackageTimes = Record<string, string>

const excludedTimeKeys = new Set(['created', 'modified'])

export const parseRecentPublishedVersions = (timeJson: string, count: number): readonly string[] => {
  const parsed = JSON.parse(timeJson) as NpmPackageTimes
  return Object.entries(parsed)
    .filter(([version, time]) => !excludedTimeKeys.has(version) && typeof time === 'string')
    .sort(([, left], [, right]) => Date.parse(right) - Date.parse(left))
    .slice(0, count)
    .map(([version]) => version)
}

export const getRecentPublishedVersions = async (count: number, cwd = process.cwd()): Promise<readonly string[]> => {
  const result = await runCommand('npm', ['view', serverPackageName, 'time', '--json'], { cwd })
  const versions = parseRecentPublishedVersions(result.stdout, count)
  if (versions.length === 0) {
    throw new Error(`No published versions found for ${serverPackageName}`)
  }
  return versions
}
