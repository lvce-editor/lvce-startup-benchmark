import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runCommand } from './process.ts'
import { serverPackageName } from './versions.ts'
import { getSafeVersionName } from './versionPaths.ts'
import type { PreparedServer } from './types.ts'

export const prepareServerPackage = async (version: string, rootDir = process.cwd()): Promise<PreparedServer> => {
  const safeVersion = getSafeVersionName(version)
  const packageDir = join(rootDir, '.tmp', 'servers', safeVersion)
  await mkdir(packageDir, { recursive: true })
  await writeFile(
    join(packageDir, 'package.json'),
    `${JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {},
      },
      null,
      2,
    )}\n`,
  )
  await runCommand('npm', ['install', '--omit=dev', `${serverPackageName}@${version}`], { cwd: packageDir })
  return {
    version,
    safeVersion,
    packageDir,
    binaryPath: join(packageDir, 'node_modules', '.bin', process.platform === 'win32' ? 'server.cmd' : 'server'),
  }
}
