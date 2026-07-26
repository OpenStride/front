// plugins/storage-providers/Dropbox/client/index.ts
import type { StoragePlugin } from '@/types/storage'
import { readRemote, writeRemote } from './DropboxSync'
import { DropboxFileService } from './DropboxFileService'
import { publicFileProviderPreference } from '../../shared/publicFileProviderPreference'

const DropboxBackupPlugin: StoragePlugin = {
  id: 'dropbox',
  label: 'Dropbox',
  setupComponent: async () => (await import('./DropboxSetup.vue')).default,
  readRemote: readRemote,
  writeRemote: writeRemote,
  icon: new URL('../assets/logo.svg', import.meta.url).href,

  // Cheap remote-change detection (no content download) so SyncService can skip
  // full reads when the remote backup file is unchanged. Prefers content_hash,
  // falling back to the file revision.
  async getRemoteChangeToken(store: string): Promise<string | null> {
    const fs = await DropboxFileService.getInstance()
    const meta = await fs.getBackupFileMeta(`${store}_backup.json`)
    if (!meta) return null
    return meta.contentHash || meta.rev || meta.serverModified || null
  },

  // Proposes itself as the provider that publishes public files, but only
  // when no provider has been chosen yet (see the declaration).
  preferences: [publicFileProviderPreference('dropbox')],

  // Public file sharing support
  supportsPublicFiles: true,

  async writePublicFile(filename: string, content: unknown): Promise<string | null> {
    const fs = await DropboxFileService.getInstance()
    return await fs.writePublicFile(filename, content)
  },

  async deleteFile(fileId: string): Promise<boolean> {
    const fs = await DropboxFileService.getInstance()
    return await fs.deleteFile(fileId)
  },

  async getPublicFileUrl(filename: string): Promise<string | null> {
    const fs = await DropboxFileService.getInstance()
    return await fs.getPublicFileUrl(filename)
  },

  extractFileIdFromUrl(url: string): string | null {
    // Dropbox has no opaque id in the sharing flow: the file path plays that
    // role, and it is recoverable from the share URL's last segment.
    return DropboxFileService.extractPathFromUrl(url)
  }
}

export default DropboxBackupPlugin
