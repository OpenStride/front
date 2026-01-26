// plugins/providers/GarminProvider/client/index.ts
import type { StoragePlugin } from '@/types/storage'
import { readRemote, writeRemote } from './GoogleDriveSync'
import { GoogleDriveFileService } from './GoogleDriveFileService'
import { sha256Hex, stableStoreString } from '@/utils/hash'
import { IndexedDBService } from '@/services/IndexedDBService'

const GDriveBackupPlugin: StoragePlugin = {
    id: 'gdrive',
    label: 'Google Drive',
    setupComponent: async () => (await import('@plugins/storage-providers/GDrive/client/GDriveSetup.vue')).default,
    //syncData: GoogleDriveSync,
    readRemote: readRemote,
    writeRemote: writeRemote,
    icon: new URL('../assets/logo.png', import.meta.url).href,

    // Public file sharing support
    supportsPublicFiles: true,

    async writePublicFile(filename: string, content: any): Promise<string | null> {
        const fs = await GoogleDriveFileService.getInstance();
        return await fs.writePublicFile(filename, content);
    },

    async deleteFile(fileId: string): Promise<boolean> {
        const fs = await GoogleDriveFileService.getInstance();
        return await fs.deleteFile(fileId);
    },

    async getPublicFileUrl(filename: string): Promise<string | null> {
        const fs = await GoogleDriveFileService.getInstance();
        return await fs.getPublicFileUrl(filename);
    },

    extractFileIdFromUrl(url: string): string | null {
        // Google Drive format: https://drive.google.com/uc?id={fileId}&export=download
        const match = url.match(/[?&]id=([^&]+)/);
        return match ? match[1] : null;
    }

    // DEPRECATED: Hash-based optimization methods below are no longer used by SyncService
    // SyncService uses incremental sync with synced flag + version-based conflict detection
    // These methods remain for backward compatibility with old StorageService (will be removed)

    // async updateManifest(summary, aggregateHash) { ... }
    // async optimizeImport(requestedStores) { ... }
    // async getRemoteManifest() { ... }
}

export default GDriveBackupPlugin