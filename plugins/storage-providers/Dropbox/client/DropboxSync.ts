// plugins/storage-providers/Dropbox/client/DropboxSync.ts
import { DropboxFileService } from './DropboxFileService'
import { normalizeRemotePayload } from '../../shared/remoteJson'

export async function readRemote(store: string): Promise<Record<string, unknown>[]> {
  const fileService = await DropboxFileService.getInstance()

  try {
    const data = await fileService.readBackupFile(`${store}_backup.json`)
    return normalizeRemotePayload(data, store, '[DropboxSync]')
  } catch (err) {
    console.warn(`[DropboxSync] Error reading remote store="${store}"`, err)
    return []
  }
}

export async function writeRemote(store: string, data: Record<string, unknown>[]): Promise<void> {
  const fileService = await DropboxFileService.getInstance()
  await fileService.writeBackupFile(`${store}_backup.json`, data)
}
