import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PreparedServer } from './types.ts'

export const baselineVersion = 'baseline'

const sourceDir = dirname(fileURLToPath(import.meta.url))

export const getBaselinePreparedServer = (): PreparedServer => {
  return {
    version: baselineVersion,
    safeVersion: baselineVersion,
    packageDir: join(sourceDir, '..'),
    binaryPath: process.execPath,
    binaryArgs: [join(sourceDir, 'baselineServer.ts')],
  }
}
