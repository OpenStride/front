// plugins/storage-providers/GDrive/client/GoogleDriveSync.ts
import { GoogleDriveFileService } from './GoogleDriveFileService'

export async function readRemote(store: string): Promise<Record<string, unknown>[]> {
  const fileService = await GoogleDriveFileService.getInstance()
  const fileId = await fileService.ensureBackupFile(`${store}_backup.json`)
  if (!fileId) {
    console.log(`[GDriveSync] No file found for store="${store}" (expected ${store}_backup.json)`)
    return []
  }

  try {
    const data = await fileService.readBackupFileContent(fileId)
    if (Array.isArray(data)) {
      console.log(`[GDriveSync] Remote store="${store}" items=${data.length}`)
      return data
    } else if (data && typeof data === 'object') {
      // Try legacy patterns
      const record = data as Record<string, unknown>
      if (Array.isArray(record.activities)) {
        console.log(
          `[GDriveSync] Remote legacy object with activities[] for store="${store}" size=${record.activities.length}`
        )
        return record.activities as Record<string, unknown>[]
      }
      const values = Object.values(record)
      if (values.every(v => typeof v === 'object')) {
        console.log(
          `[GDriveSync] Remote object dictionary parsed size=${values.length} store="${store}"`
        )
        return values as Record<string, unknown>[]
      }
      console.warn(`[GDriveSync] Remote store="${store}" non-array object ignored`)
      return []
    } else if (data != null) {
      console.warn(`[GDriveSync] Remote store="${store}" unexpected primitive type=${typeof data}`)
      return []
    }
    console.log(`[GDriveSync] Remote store="${store}" empty/null`)
    return []
  } catch (err) {
    console.warn(`[GDriveSync] Error reading remote store="${store}"`, err)
    return []
  }
}

export async function writeRemote(store: string, data: Record<string, unknown>[]): Promise<void> {
  const fileService = await GoogleDriveFileService.getInstance()
  const fileId = await fileService.ensureBackupFile(`${store}_backup.json`)
  if (!fileId) throw new Error('Cannot ensure file on Drive')
  await fileService.writeBackupFileByFileId(fileId, data)
}
