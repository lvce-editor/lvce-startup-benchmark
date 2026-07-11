import { readdir } from 'node:fs/promises'

interface CountOpenFileDescriptorsOptions {
  readonly platform?: NodeJS.Platform
  readonly readdir?: typeof readdir
}

export const countOpenFileDescriptors = async (
  pid: number | undefined,
  options: CountOpenFileDescriptorsOptions = {},
): Promise<number | null> => {
  if (!pid || (options.platform ?? process.platform) !== 'linux') {
    return null
  }
  try {
    const entries = await (options.readdir ?? readdir)(`/proc/${pid}/fd`)
    return entries.length
  } catch {
    return null
  }
}
