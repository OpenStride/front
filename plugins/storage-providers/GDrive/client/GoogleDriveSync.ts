// plugins/providers/GarminProvider/client/gdriveSync.ts
import { GoogleDriveFileService } from './GoogleDriveFileService'
import { IndexedDBService } from '@/services/IndexedDBService'

export async function readRemote(store: string): Promise<any[]> {
    const fileService = await GoogleDriveFileService.getInstance();
    const fileId = await fileService.ensureBackupFile(`${store}_backup.json`);
    if (!fileId) {
        console.log(`[GDriveSync] No file found for store="${store}" (expected ${store}_backup.json)`);
        return [];
    }

    try {
        const data = await fileService.readBackupFileContent(fileId);
        if (Array.isArray(data)) {
            console.log(`[GDriveSync] Remote store="${store}" items=${data.length}`);
            return data;
        } else if (data && typeof data === 'object') {
            // Try legacy patterns
            if (Array.isArray((data as any).activities)) {
                console.log(`[GDriveSync] Remote legacy object with activities[] for store="${store}" size=${(data as any).activities.length}`);
                return (data as any).activities;
            }
            const values = Object.values(data);
            if (values.every(v => typeof v === 'object')) {
                console.log(`[GDriveSync] Remote object dictionary parsed size=${values.length} store="${store}"`);
                return values as any[];
            }
            console.warn(`[GDriveSync] Remote store="${store}" non-array object ignored`);
            return [];
        } else if (data != null) {
            console.warn(`[GDriveSync] Remote store="${store}" unexpected primitive type=${typeof data}`);
            return [];
        }
        console.log(`[GDriveSync] Remote store="${store}" empty/null`);
        return [];
    } catch (err) {
        console.warn(`[GDriveSync] Error reading remote store="${store}"`, err);
        return [];
    }
}

export async function writeRemote(store: string, data: any[]): Promise<void> {
    const fileService = await GoogleDriveFileService.getInstance();
    const fileId = await fileService.ensureBackupFile(`${store}_backup.json`);
    if (!fileId) throw new Error('Cannot ensure file on Drive');
    await fileService.writeBackupFileByFileId(fileId, data);
}

//deprecated
/* export async function GoogleDriveSync(onlystores?: string[] | null): Promise<void> {
    // 1. Récupère les services
    const fileService = await GoogleDriveFileService.getInstance()
    const dbService = await IndexedDBService.getInstance()

    // 2. Exporte les données de chaque store
    //const stores = await dbService.getObjectStoresNames().
    let stores = await dbService.getObjectStoresNames()
    if (onlystores && onlystores.length > 0) {
        stores = stores.filter(store => onlystores.includes(store));
    }

    const backupData: Record<string, any[]> = {}

    for (const store of stores) {
        try {
            backupData[store] = await dbService.exportDB(store)
        } catch (err) {
            console.warn(`❌ Échec export ${store}:`, err)
            backupData[store] = []
        }
    }
    const defaultKeyFn = (item: any) => {
        if (item.key) {
            return item.key;
        } else {
            if (item.activityId) {
                //TODO changer ca !
                return `garmin_${item.activityId}`;
            }
        }
        return `${item.id}`;
    };
    // 3. Écrit le fichier JSON sur Google Drive
    try {
        await Promise.all(
            stores.map(async store => {
                const filename = `${store}_backup.json`;
                const fileId = await fileService.ensureBackupFile(filename);
                if (!fileId) {
                    console.warn(`[Sync] Impossible d'assurer ${filename}`);
                    return;
                }

                // a) Lecture distante
                let remoteArr: any[] = [];
                try {
                    const data = await fileService.readBackupFileContent(fileId);
                    if (Array.isArray(data)) remoteArr = data;
                } catch {
                    // pas de contenu distant
                }

                // b) Lecture locale
                let localArr: any[] = [];
                try {
                    localArr = await dbService.exportDB(store);
                } catch {
                    // ignore
                }

                // c) Construire des maps pour comparer contenu
                const keyFn = defaultKeyFn;
                const remoteMap = new Map<string, any>();
                remoteArr.forEach(item => remoteMap.set(keyFn(item), item));
                const localMap = new Map<string, any>();
                localArr.forEach(item => localMap.set(keyFn(item), item));

                // d) Calcule diff pour remote (nouveaux ET modifiés locaux)
                const toRemote: any[] = [];
                localMap.forEach((localItem, key) => {
                    const remoteItem = remoteMap.get(key);
                    if (!remoteItem || JSON.stringify(remoteItem) !== JSON.stringify(localItem)) {
                        toRemote.push(localItem);
                    }
                });

                // e) Calcule diff pour local (nouveaux distants)
                const toLocal: any[] = [];
                remoteMap.forEach((remoteItem, key) => {
                    if (!localMap.has(key)) {
                        toLocal.push(remoteItem);
                    }
                });

                // f) Applique diff local
                if (toLocal.length) {
                    try {
                        if (store === 'activities' || store === 'activity_details') {
                            await dbService.addItemsToStore(store, toLocal, keyFn);
                        } else {
                            await dbService.addItemsToStore(store, toLocal);
                        }
                        console.log(`[Sync] Ajout de ${toLocal.length} items dans "${store}"`);
                    } catch (err) {
                        console.error(`[Sync] Échec ajout local "${store}":`, err);
                    }
                } else {
                    console.log(`[Sync] Aucun nouvel élément local à ajouter pour "${store}"`);
                }

                // g) Fusion et écriture distante si besoin
                if (toRemote.length) {
                    // fusion : items distants non écrasés par locaux, puis tous locaux
                    const merged = [
                        ...remoteArr.filter(item => !localMap.has(keyFn(item))),
                        ...localArr
                    ];
                    try {
                        await fileService.writeBackupFileByFileId(fileId, merged);
                        console.log(`[Sync] Mise à jour "${filename}" sur Drive (+${toRemote.length} items)`);
                    } catch (err) {
                        console.error(`[Sync] Erreur écriture Drive "${filename}":`, err);
                    }
                }
            })
        );

        console.log('✅ Google Drive : backup effectué')
    } catch (err) {
        console.error('❌ Google Drive : erreur lors du backup', err)
        throw err
    }
} */
