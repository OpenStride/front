/**
 * Normalization of a remote backup payload into the flat array `SyncService`
 * expects, shared by every storage provider.
 *
 * Backups have been written in a few shapes over time (plain array, legacy
 * `{ activities: [...] }` wrapper, id-keyed dictionary), so every provider has
 * to tolerate all of them when reading.
 */
export function normalizeRemotePayload(
  data: unknown,
  store: string,
  logPrefix: string
): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    console.log(`${logPrefix} Remote store="${store}" items=${data.length}`)
    return data
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>

    if (Array.isArray(record.activities)) {
      console.log(
        `${logPrefix} Remote legacy object with activities[] for store="${store}" size=${record.activities.length}`
      )
      return record.activities as Record<string, unknown>[]
    }

    const values = Object.values(record)
    if (values.every(v => typeof v === 'object')) {
      console.log(
        `${logPrefix} Remote object dictionary parsed size=${values.length} store="${store}"`
      )
      return values as Record<string, unknown>[]
    }

    console.warn(`${logPrefix} Remote store="${store}" non-array object ignored`)
    return []
  }

  if (data != null) {
    console.warn(`${logPrefix} Remote store="${store}" unexpected primitive type=${typeof data}`)
    return []
  }

  console.log(`${logPrefix} Remote store="${store}" empty/null`)
  return []
}
