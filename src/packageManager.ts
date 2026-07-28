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

export const getServerPackageJson = (version: string): string => {
  const alias = getServerPackageAlias(version)
  return `${JSON.stringify(
    {
      private: true,
      type: 'module',
      dependencies: {
        [alias]: `npm:${serverPackageName}@${version}`,
      },
    },
    null,
    2,
  )}\n`
}

export const installServerPackage = async (
  versionDir: string,
  run: typeof runCommand = runCommand,
): Promise<void> => {
  const install = async (): Promise<void> => {
    await run('npm', ['install', '--omit=dev'], { cwd: versionDir })
  }

  try {
    await install()
  } catch {
    await Promise.all([
      rm(join(versionDir, 'node_modules'), { recursive: true, force: true }),
      rm(join(versionDir, 'package-lock.json'), { force: true }),
    ])
    await install()
  }
}

const getServerVersionDirectory = (version: string, storeDir: string): string => {
  return join(storeDir, getServerPackageAlias(version))
}

const getPreparedServer = (version: string, storeDir: string): PreparedServer => {
  const safeVersion = getSafeVersionName(version)
  const alias = getServerPackageAlias(version)
  const packageDir = join(getServerVersionDirectory(version, storeDir), 'node_modules', alias)
  return {
    version,
    safeVersion,
    packageDir,
    binaryPath: process.execPath,
    binaryArgs: [join(packageDir, 'bin', 'server.js')],
  }
}

const prepareServerPackageInStore = async (version: string, storeDir: string): Promise<PreparedServer> => {
  const versionDir = getServerVersionDirectory(version, storeDir)
  await mkdir(versionDir, { recursive: true })
  const packageJsonChanged = await writeFileIfChanged(join(versionDir, 'package.json'), getServerPackageJson(version))
  const prepared = getPreparedServer(version, storeDir)
  const binaryExists = await fileExists(prepared.binaryArgs?.[0] ?? prepared.binaryPath)
  if (packageJsonChanged || !binaryExists) {
    console.info(`[benchmark] installing server package ${version}`)
    await installServerPackage(versionDir)
  }
  return prepared
}

const removeLegacyStore = async (storeDir: string): Promise<void> => {
  await Promise.all([
    rm(join(storeDir, 'node_modules'), { recursive: true, force: true }),
    rm(join(storeDir, 'package-lock.json'), { force: true }),
    rm(join(storeDir, 'package.json'), { force: true }),
  ])
}

export const prepareServerPackages = async (
  versions: readonly string[],
  rootDir = process.cwd(),
): Promise<ReadonlyMap<string, PreparedServer>> => {
  const storeDir = join(rootDir, serverStoreDirectory)
  await mkdir(storeDir, { recursive: true })
  await removeLegacyStore(storeDir)
  const uniqueVersions = [...new Set(versions)]
  const preparedServers: PreparedServer[] = []
  const installConcurrency = 4
  for (let index = 0; index < uniqueVersions.length; index += installConcurrency) {
    const batch = uniqueVersions.slice(index, index + installConcurrency)
    preparedServers.push(...(await Promise.all(batch.map((version) => prepareServerPackageInStore(version, storeDir)))))
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
