import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface BenchmarkVersions {
  readonly versions: readonly string[]
}

export const defaultBenchmarkVersionCount = 100

const validateVersions = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0 || value.some((version) => typeof version !== 'string' || !version.trim())) {
    throw new Error('versions.json must contain a non-empty versions array')
  }
  const versions = value.map((version) => version.trim())
  if (new Set(versions).size !== versions.length) {
    throw new Error('versions.json must not contain duplicate versions')
  }
  return versions
}

export const parseBenchmarkVersions = (content: string): BenchmarkVersions => {
  const parsed = JSON.parse(content) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('versions.json must contain an object')
  }
  return { versions: validateVersions((parsed as { readonly versions?: unknown }).versions) }
}

export const readBenchmarkVersions = async (path = resolve('versions.json')): Promise<BenchmarkVersions> => {
  return parseBenchmarkVersions(await readFile(path, 'utf8'))
}

export const writeBenchmarkVersions = async (versions: readonly string[], path = resolve('versions.json')): Promise<void> => {
  const manifest = { versions: validateVersions(versions) }
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
}
