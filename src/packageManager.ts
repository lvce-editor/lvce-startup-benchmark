import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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

export const installServerPackages = async (
  storeDir: string,
  run: typeof runCommand = runCommand,
): Promise<void> => {
  const install = async (): Promise<void> => {
    await run('npm', ['install', '--omit=dev'], { cwd: storeDir })
  }

  try {
    await install()
  } catch {
    await Promise.all([
      rm(join(storeDir, 'node_modules'), { recursive: true, force: true }),
      rm(join(storeDir, 'package-lock.json'), { force: true }),
    ])
    await install()
  }
}

const getPreparedServer = (version: string, packageDir: string): PreparedServer => {
  const safeVersion = getSafeVersionName(version)
  return {
    version,
    safeVersion,
    packageDir,
    binaryPath: process.execPath,
    binaryArgs: [join(packageDir, 'bin', 'server.js')],
  }
}

const hasPreparedServer = async (preparedServer: PreparedServer): Promise<boolean> => {
  return fileExists(preparedServer.binaryArgs?.[0] ?? preparedServer.binaryPath)
}

const prepareIsolatedServerPackage = async (
  version: string,
  storeDir: string,
  run: typeof runCommand,
): Promise<PreparedServer> => {
  const alias = getServerPackageAlias(version)
  const versionStoreDir = join(storeDir, 'versions', alias)
  const packageDir = join(versionStoreDir, 'node_modules', alias)
  const preparedServer = getPreparedServer(version, packageDir)
  await mkdir(versionStoreDir, { recursive: true })

  const packageJsonChanged = await writeFileIfChanged(join(versionStoreDir, 'package.json'), getServerStorePackageJson([version]))
  if (packageJsonChanged || !(await hasPreparedServer(preparedServer))) {
    await installServerPackages(versionStoreDir, run)
  }
  return preparedServer
}

export const prepareServerPackages = async (
  versions: readonly string[],
  rootDir = process.cwd(),
  run: typeof runCommand = runCommand,
): Promise<ReadonlyMap<string, PreparedServer>> => {
  const storeDir = join(rootDir, serverStoreDirectory)
  await mkdir(storeDir, { recursive: true })

  const preparedServers: PreparedServer[] = []
  for (const version of versions) {
    const alias = getServerPackageAlias(version)
    const legacyPackageDir = join(storeDir, 'node_modules', alias)
    const legacyPreparedServer = getPreparedServer(version, legacyPackageDir)
    if (await hasPreparedServer(legacyPreparedServer)) {
      preparedServers.push(legacyPreparedServer)
      continue
    }
    preparedServers.push(await prepareIsolatedServerPackage(version, storeDir, run))
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
