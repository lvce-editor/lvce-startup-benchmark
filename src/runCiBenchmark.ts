import { pathToFileURL } from 'node:url'
import { runCli } from './main.ts'

const getRequiredEnvironmentValue = (environment: NodeJS.ProcessEnv, name: string): string => {
  const value = environment[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

export const getCiBenchmarkArgs = (environment: NodeJS.ProcessEnv): readonly string[] => {
  const args = [
    '--versions',
    getRequiredEnvironmentValue(environment, 'VERSIONS'),
    '--iterations',
    environment.ITERATIONS?.trim() || '10',
    '--warmups',
    '1',
    '--output',
    'results',
  ]
  if ((environment.PROFILE?.trim() || 'true') === 'true') {
    args.push('--profile')
  }
  return args
}

export const runCiBenchmark = async (environment: NodeJS.ProcessEnv = process.env): Promise<void> => {
  await runCli(getCiBenchmarkArgs(environment))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCiBenchmark().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
