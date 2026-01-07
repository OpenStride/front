// plugins/providers/GarminProvider/client/index.ts
import type { StoragePlugin } from '@/types/storage'
import { readRemote, writeRemote } from './GoogleDriveSync'
import { GoogleDriveFileService } from './GoogleDriveFileService'
import { sha256Hex, stableStoreString } from '@/utils/hash'
import { IndexedDBService } from '@/services/IndexedDBService'

const GDriveBackupPlugin: StoragePlugin = {
    id: 'gdrive',
    label: 'Google Drive',
    setupComponent: async () => (await import('./GDriveSetup.vue')).default,
    //syncData: GoogleDriveSync,
    readRemote: readRemote,
    writeRemote: writeRemote,
    icon: new URL('../assets/logo.png', import.meta.url).href
    ,
    async updateManifest(summary, aggregateHash) {
        try {
            const fs = await GoogleDriveFileService.getInstance();
            const manifest = {
                manifestVersion: 1,
                generatedAt: Date.now(),
                stores: summary,
                global: { hashAggregate: aggregateHash }
            };
            await fs.writeManifest(manifest);
            console.log('[GDrivePlugin] Manifest updated');
        } catch (err) {
            console.warn('[GDrivePlugin] Manifest update failed', err);
        }
    },
    async optimizeImport(requestedStores) {
        try {
            const fs = await GoogleDriveFileService.getInstance();
            const manifest = await fs.readManifest();
            if (!manifest?.stores) return requestedStores;
            const db = await IndexedDBService.getInstance();
            const local = await db.getData('lastStorageManifestSummary');
            if (!local?.stores) return requestedStores; // no baseline, import all
            const remoteMap = new Map(manifest.stores.map((s: any) => [s.name, s.contentHash]));
            const localMap = new Map((local.stores as any[]).map((s: any) => [s.name, s.contentHash]));
            const filtered = requestedStores.filter(name => remoteMap.get(name) !== localMap.get(name));
            if (filtered.length === 0) {
                console.log('[GDrivePlugin] All requested stores already up-to-date (hash match)');
                return [];
            }
            console.log('[GDrivePlugin] optimizeImport -> will import stores:', filtered);
            return filtered;
        } catch {
            return requestedStores;
        }
    },
    async getRemoteManifest() {
        try {
            const fs = await GoogleDriveFileService.getInstance();
            const manifest = await fs.readManifest();
            if (!manifest?.stores) return null;
            return { stores: manifest.stores };
        } catch { return null; }
    }
}

export default GDriveBackupPlugin