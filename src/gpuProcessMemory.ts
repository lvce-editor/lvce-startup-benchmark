import { readFile } from 'node:fs/promises'

interface BrowserProcessInfo {
  readonly id: number
  readonly type: string
}

const parseResidentSetSize = (status: string): number | null => {
  const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status)
  return match?.[1] ? Number(match[1]) * 1024 : null
}

export const getGpuProcessMemoryBytes = async (
  processes: readonly BrowserProcessInfo[],
  readStatus: (pid: number) => Promise<string> = (pid) => readFile(`/proc/${pid}/status`, 'utf8'),
  platform = process.platform,
): Promise<number | null> => {
  if (platform !== 'linux') {
    return null
  }
  const gpuProcesses = processes.filter((browserProcess) => browserProcess.type.toLowerCase() === 'gpu')
  const residentSetSizes = await Promise.all(
    gpuProcesses.map(async (browserProcess) => {
      const status = await readStatus(browserProcess.id).catch(() => '')
      return parseResidentSetSize(status)
    }),
  )
  const measured = residentSetSizes.filter((value): value is number => value !== null)
  return measured.length === 0 ? null : measured.reduce((total, value) => total + value, 0)
}
