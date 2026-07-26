// plugins/storage-providers/GDrive/client/GoogleDriveSync.ts
import { GoogleDriveFileService } from './GoogleDriveFileService'
import { normalizeRemotePayload } from '../../shared/remoteJson'

export async function readRemote(store: string): Promise<Record<string, unknown>[]> {
  const fileService = await GoogleDriveFileService.getInstance()
  const fileId = await fileService.ensureBackupFile(`${store}_backup.json`)
  if (!fileId) {
    console.log(`[GDriveSync] No file found for store="${store}" (expected ${store}_backup.json)`)
    return []
  }

  try {
    const data = await fileService.readBackupFileContent(fileId)
    return normalizeRemotePayload(data, store, '[GDriveSync]')
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
