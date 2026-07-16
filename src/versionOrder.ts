import { baselineVersion } from './baseline.ts'

const versionCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
})

export const compareVersions = (left: string, right: string): number => {
  if (left === baselineVersion) {
    return right === baselineVersion ? 0 : -1
  }
  if (right === baselineVersion) {
    return 1
  }
  return versionCollator.compare(left, right)
}
