// src/services/BackupListenerService.ts
import { IndexedDBService } from './IndexedDBService';
import { StorageService } from './StorageService';
import { debounce } from '../utils/debounce';

export async function setupBackupListener(intervalMs = 2000) {
    const dbService = await IndexedDBService.getInstance();
    const backupService = StorageService.getInstance();

    // 🗂 tableau pour accumuler les détails reçus
    const pendingDetails: Array<{ store: string; key: string }> = [];

    // version débouncée qui va vider `pendingDetails`
    const debouncedTrigger = debounce(() => {
        if (pendingDetails.length > 0) {
            // copie et reset
            const toSend = pendingDetails.splice(0, pendingDetails.length);
            backupService.triggerBackup(toSend);
        }
    }, intervalMs);

    // écoute l'événement dbChange et empile
    dbService.emitter.addEventListener('dbChange', (evt: Event) => {
        const e = evt as CustomEvent<{ store: string; key: string }>;
        pendingDetails.push(e.detail);
        debouncedTrigger();
    });
}
