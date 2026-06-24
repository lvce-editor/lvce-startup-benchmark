import { resolve } from 'node:path'
import type { BenchmarkOptions, BrowserName } from './types.ts'

const defaults: BenchmarkOptions = {
  versions: ['latest'],
  recentVersions: null,
  iterations: 10,
  warmups: 1,
  timeout: 60_000,
  portBase: 3200,
  workspace: process.cwd(),
  urlPath: '/',
  output: 'results',
  profile: false,
  headed: false,
  browser: 'chromium',
}

const takeValue = (args: readonly string[], index: number, flag: string): string => {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`)
  }
  return value
}

const parsePositiveInteger = (value: string, flag: string): number => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0 || `${parsed}` !== value) {
    throw new Error(`${flag} must be a non-negative integer`)
  }
  return parsed
}

const parseIntegerAtLeast = (value: string, flag: string, minimum: number): number => {
  const parsed = parsePositiveInteger(value, flag)
  if (parsed < minimum) {
    throw new Error(`${flag} must be at least ${minimum}`)
  }
  return parsed
}

const parseVersions = (value: string): readonly string[] => {
  const versions = value
    .split(',')
    .map((version) => version.trim())
    .filter(Boolean)
  if (versions.length === 0) {
    throw new Error('--versions must contain at least one version or tag')
  }
  return versions
}

const normalizeUrlPath = (value: string): string => {
  if (!value) {
    return '/'
  }
  return value.startsWith('/') ? value : `/${value}`
}

const parseBrowser = (value: string): BrowserName => {
  if (value !== 'chromium') {
    throw new Error(`Unsupported browser "${value}". Only chromium is currently supported.`)
  }
  return value
}

export const parseArgs = (argv: readonly string[]): BenchmarkOptions => {
  let options = { ...defaults }
  let hasVersions = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--versions':
        if (options.recentVersions !== null) {
          throw new Error('--versions cannot be used with --recent-versions')
        }
        hasVersions = true
        options = { ...options, versions: parseVersions(takeValue(argv, i, arg)) }
        i++
        break
      case '--recent-versions':
        if (hasVersions) {
          throw new Error('--recent-versions cannot be used with --versions')
        }
        options = { ...options, recentVersions: parseIntegerAtLeast(takeValue(argv, i, arg), arg, 1) }
        i++
        break
      case '--iterations':
        options = { ...options, iterations: parsePositiveInteger(takeValue(argv, i, arg), arg) }
        i++
        break
      case '--warmups':
        options = { ...options, warmups: parsePositiveInteger(takeValue(argv, i, arg), arg) }
        i++
        break
      case '--timeout':
        options = { ...options, timeout: parsePositiveInteger(takeValue(argv, i, arg), arg) }
        i++
        break
      case '--port-base':
        options = { ...options, portBase: parsePositiveInteger(takeValue(argv, i, arg), arg) }
        i++
        break
      case '--workspace':
        options = { ...options, workspace: resolve(takeValue(argv, i, arg)) }
        i++
        break
      case '--url-path':
        options = { ...options, urlPath: normalizeUrlPath(takeValue(argv, i, arg)) }
        i++
        break
      case '--output':
        options = { ...options, output: takeValue(argv, i, arg) }
        i++
        break
      case '--profile':
        options = { ...options, profile: true }
        break
      case '--headed':
        options = { ...options, headed: true }
        break
      case '--browser':
        options = { ...options, browser: parseBrowser(takeValue(argv, i, arg)) }
        i++
        break
      case '--help':
      case '-h':
        throw new Error(getHelpText())
      default:
        throw new Error(`Unknown argument ${arg}`)
    }
  }
  return options
}

export const getHelpText = (): string => {
  return `Usage: npm run benchmark -- [options]

Options:
  --versions <csv>     @lvce-editor/server versions or tags (default: latest)
  --recent-versions <n>
                       Resolve and benchmark the latest n published versions
  --iterations <n>     Measured iterations per version (default: 10)
  --warmups <n>        Warmup iterations per version (default: 1)
  --timeout <ms>       Navigation/server startup timeout (default: 60000)
  --port-base <n>      First port to try (default: 3200)
  --workspace <path>   Workspace path passed to the server (default: cwd)
  --url-path <path>    URL path to visit (default: /)
  --output <dir>       Results directory (default: results)
  --profile            Save a Playwright trace for measured iterations
  --headed             Run Chromium headed
  --browser chromium   Browser to run (default: chromium)
`
}
