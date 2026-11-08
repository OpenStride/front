// plugins/providers/GarminProvider/client/index.ts
import type { StoragePlugin } from '@/types/storage'
import { readRemote, writeRemote } from './GoogleDriveSync'
import { GoogleDriveFileService } from './GoogleDriveFileService'

const GDriveBackupPlugin: StoragePlugin = {
  id: 'gdrive',
  label: 'Google Drive',
  setupComponent: async () => (await import('./GDriveSetup.vue')).default,
  //syncData: GoogleDriveSync,
  readRemote: readRemote,
  writeRemote: writeRemote,
  icon: new URL('../assets/logo.png', import.meta.url).href,

  // Cheap remote-change detection (no content download) so SyncService can skip
  // full reads when the remote backup file is unchanged. Prefers the Drive
  // md5Checksum, falling back to modifiedTime.
  async getRemoteChangeToken(store: string): Promise<string | null> {
    const fs = await GoogleDriveFileService.getInstance()
    const meta = await fs.getBackupFileMeta(`${store}_backup.json`)
    if (!meta) return null
    return meta.md5 || meta.modifiedTime || null
  },

  // Public file sharing support
  supportsPublicFiles: true,

  async writePublicFile(filename: string, content: unknown): Promise<string | null> {
    const fs = await GoogleDriveFileService.getInstance()
    return await fs.writePublicFile(filename, content)
  },

  // Private files: the photos of the reader's outings
  async writeFile(name: string, content: Blob): Promise<string | null> {
    const fs = await GoogleDriveFileService.getInstance()
    return await fs.writeFile(name, content)
  },

  async readFile(fileId: string): Promise<Blob | null> {
    const fs = await GoogleDriveFileService.getInstance()
    return await fs.readFile(fileId)
  },

  async deleteFile(fileId: string): Promise<boolean> {
    const fs = await GoogleDriveFileService.getInstance()
    return await fs.deleteFile(fileId)
  },

  async getPublicFileUrl(filename: string): Promise<string | null> {
    const fs = await GoogleDriveFileService.getInstance()
    return await fs.getPublicFileUrl(filename)
  },

  async clearPublicFiles(): Promise<boolean> {
    const fs = await GoogleDriveFileService.getInstance()
    return await fs.clearPublicFiles()
  },

  extractFileIdFromUrl(url: string): string | null {
    // Google Drive format: https://drive.google.com/uc?id={fileId}&export=download
    const match = url.match(/[?&]id=([^&]+)/)
    return match ? match[1] : null
  }
}

export default GDriveBackupPlugin
