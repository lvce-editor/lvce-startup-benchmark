import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runCommand } from './process.ts'
import { serverPackageName } from './versions.ts'
import { getSafeVersionName } from './versionPaths.ts'
import type { PreparedServer } from './types.ts'

const serverStoreDirectory = join('.tmp', 'server-store')

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const writeFileIfChanged = async (path: string, content: string): Promise<boolean> => {
  try {
    const existing = await readFile(path, 'utf8')
    if (existing === content) {
      return false
    }
  } catch {
    // Missing files are written below.
  }
  await writeFile(path, content)
  return true
}

export const getServerPackageAlias = (version: string): string => {
  const safeVersion = getSafeVersionName(version)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const suffix = createHash('sha256').update(version).digest('hex').slice(0, 8)
  return `lvce-server-${safeVersion || 'version'}-${suffix}`
}

export const getServerStorePackageJson = (versions: readonly string[]): string => {
  const dependencies = Object.fromEntries(versions.map((version) => [getServerPackageAlias(version), `npm:${serverPackageName}@${version}`]))
  return `${JSON.stringify(
    {
      private: true,
      type: 'module',
      dependencies,
    },
    null,
    2,
  )}\n`
}

const getPreparedServer = (version: string, storeDir: string): PreparedServer => {
  const safeVersion = getSafeVersionName(version)
  const alias = getServerPackageAlias(version)
  const packageDir = join(storeDir, 'node_modules', alias)
  return {
    version,
    safeVersion,
    packageDir,
    binaryPath: process.execPath,
    binaryArgs: [join(packageDir, 'bin', 'server.js')],
  }
}

const hasPreparedServers = async (preparedServers: readonly PreparedServer[]): Promise<boolean> => {
  const binaryChecks = await Promise.all(preparedServers.map((prepared) => fileExists(prepared.binaryArgs?.[0] ?? prepared.binaryPath)))
  return binaryChecks.every(Boolean)
}

export const prepareServerPackages = async (
  versions: readonly string[],
  rootDir = process.cwd(),
): Promise<ReadonlyMap<string, PreparedServer>> => {
  const storeDir = join(rootDir, serverStoreDirectory)
  const packageJsonPath = join(storeDir, 'package.json')
  await mkdir(storeDir, { recursive: true })

  const packageJsonChanged = await writeFileIfChanged(packageJsonPath, getServerStorePackageJson(versions))
  const preparedServers = versions.map((version) => getPreparedServer(version, storeDir))
  if (packageJsonChanged || !(await hasPreparedServers(preparedServers))) {
    await runCommand('npm', ['install', '--omit=dev', '--prefer-offline'], { cwd: storeDir })
  }

  return new Map(preparedServers.map((prepared) => [prepared.version, prepared]))
}

export const prepareServerPackage = async (version: string, rootDir = process.cwd()): Promise<PreparedServer> => {
  const preparedServers = await prepareServerPackages([version], rootDir)
  const prepared = preparedServers.get(version)
  if (!prepared) {
    throw new Error(`Failed to prepare ${serverPackageName}@${version}`)
  }
  return prepared
}
