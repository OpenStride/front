/**
 * Semantic versioning utilities for version comparison
 */

export interface Version {
  major: number
  minor: number
  patch: number
}

/**
 * Parse a semantic version string (e.g., "1.2.3")
 * @throws {Error} If version format is invalid
 */
export function parseVersion(version: string): Version {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) {
    throw new Error(`Invalid version format: ${version}`)
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  }
}

/**
 * Compare two semantic version strings
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const vA = parseVersion(a)
  const vB = parseVersion(b)

  if (vA.major !== vB.major) return vA.major - vB.major
  if (vA.minor !== vB.minor) return vA.minor - vB.minor
  return vA.patch - vB.patch
}

/**
 * Check if target version is newer than current version
 */
export function isNewerVersion(current: string, target: string): boolean {
  return compareVersions(target, current) > 0
}
