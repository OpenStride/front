import { StoragePluginManager } from '@/services/StoragePluginManager';
import type { StoragePlugin } from '@/types/storage';
import { IndexedDBService } from '@/services/IndexedDBService'
import { sha256Hex, stableStoreString } from '@/utils/hash'
import { ToastService } from '@/services/ToastService'

export class StorageService {
    private static instance: StorageService;
    private pluginManager = StoragePluginManager.getInstance();
    private suppressBackupsUntil = 0; // timestamp ms; while in hydration/import we ignore backup triggers
    private lastBackupToastAt = 0;
    private constructor() { }

    public static getInstance(): StorageService {
        if (!StorageService.instance) {
            StorageService.instance = new StorageService();
        }
        return StorageService.instance;
    }

    public async triggerBackup(details: Array<{ store: string; key: string }>): Promise<void> {
        console.log('🔧 Backup triggered');
        if (Date.now() < this.suppressBackupsUntil) {
            console.log('[StorageService] Backup suppressed (hydration phase)');
            return;
        }
        // Filter out internal summary key to prevent feedback loop
        details = details.filter(d => !(d.store === 'settings' && d.key === 'lastStorageManifestSummary'));
        if (details.length === 0) return; // nothing meaningful
        try {
            let uniqueStores = Array.from(new Set(details.map(detail => detail.store)));

            // If storage plugin enablement changed, perform a full sync of all known stores
            const pluginChanged = details.some(d => d.store === 'settings' && d.key === 'enabledStoragePlugins');
            if (pluginChanged) {
                try {
                    const db = await IndexedDBService.getInstance();
                    const allStores = await db.getObjectStoresNames();
                    uniqueStores = Array.from(new Set([...uniqueStores, ...allStores]));
                    console.log('🔁 Full sync triggered due to storage plugin change');
                } catch (_) { /* ignore */ }
            }

            const changed = await this.syncStores(uniqueStores.map(store => ({ store, key: '' })));
            console.log('✅ Backup completed');
            if (changed && (Date.now() - this.lastBackupToastAt > 1500)) {
                ToastService.push('Sauvegarde terminée', { type: 'success', timeout: 3000 });
                this.lastBackupToastAt = Date.now();
            }
        } catch (error) {
            console.error('❌ Backup failed:', error);
            ToastService.push('Echec de la sauvegarde', { type: 'error', timeout: 5000 });
        }
    }

    public async syncStores(details: Array<{ store: string; key: string }>): Promise<boolean> {
        const plugins = await this.pluginManager.getMyStoragePlugins();
        const dbService = await IndexedDBService.getInstance();

        const uniqueStores = Array.from(new Set(details.map(d => d.store)));
        let anyChanges = false;

        for (const plugin of plugins) {
            console.log(`🔄 Sync with ${plugin.label}`);
            for (const store of uniqueStores) {
                // Lightweight hash comparison via plugin manifest (if provided)
                let remoteHash: string | null = null;
                if (plugin.getRemoteManifest) {
                    try {
                        const mf = await plugin.getRemoteManifest();
                        remoteHash = mf?.stores?.find(s => s.name === store)?.contentHash || null;
                    } catch { /* ignore */ }
                }
                const keyFn = (item: any) => item.key || item.id || item.activityId || JSON.stringify(item);
                const stripLM = (obj: any) => {
                    if (!obj || typeof obj !== 'object') return obj;
                    const { lastModified, ...rest } = obj as any;
                    return rest;
                };
                const isDifferent = (a: any, b: any) => {
                    if (!a && b) return true;
                    if (!b && a) return true;
                    return JSON.stringify(stripLM(a)) !== JSON.stringify(stripLM(b));
                };

                try {
                    const localData = await dbService.exportDB(store);
                    // Compute local hash early to possibly skip remote read
                    let localHash: string | null = null;
                    try {
                        const keyFn2 = (it: any) => it?.key || it?.id || it?.activityId || '';
                        const str = stableStoreString(store === 'settings' ? localData.filter((i:any)=> i?.key !== 'lastStorageManifestSummary') : localData, keyFn2);
                        localHash = `sha256:${await sha256Hex(str)}`;
                    } catch { /* ignore */ }

                    let remoteData: any[];
                    if (remoteHash && localHash && remoteHash === localHash) {
                        console.log(`[StorageService][skip] store="${store}" hash match (${localHash})`);
                        continue; // skip this store entirely (no change)
                    }
                    remoteData = await plugin.readRemote(store);

                    const localMap = new Map(localData.map((item: any) => [keyFn(item), item]));
                    const remoteMap = new Map(remoteData.map((item: any) => [keyFn(item), item]));

                    // ➕ Nouveaux ou modifiés à envoyer à distance
                    // ensure local items have lastModified
                    const now = Date.now();
                    localData.forEach((item: any) => { if (item && typeof item === 'object' && item.lastModified == null) item.lastModified = now; });
                    const toRemote = [...localMap.entries()]
                        .filter(([k, v]) => {
                            const remoteVal = remoteMap.get(k);
                            return !remoteVal || isDifferent(remoteVal, v);
                        })
                        .map(([_, v]) => v);

                    // ➕ Nouveaux distants à ramener localement
                    const toLocal = [...remoteMap.entries()]
                        .filter(([k, _]) => !localMap.has(k))
                        .map(([_, v]) => {
                            if (v && typeof v === 'object' && (v as any).lastModified == null) (v as any).lastModified = now;
                            return v;
                        });

                    console.log(`[StorageService][diff] store="${store}" local=${localData.length} remote=${remoteData.length} toLocal=${toLocal.length} toRemote=${toRemote.length}`);

                    if (toLocal.length > 0) {
                        await dbService.addItemsToStore(store, toLocal, keyFn);
                        console.log(`📥 ${toLocal.length} items added to "${store}" from ${plugin.label}`);
                        anyChanges = true;
                    }

                    if (toRemote.length > 0) {
                        const merged = [
                            ...remoteData.filter(item => !localMap.has(keyFn(item))),
                            ...localData
                        ];
                        // ensure merged items sorted deterministic (optional) by lastModified descending then key
                        merged.forEach((m: any) => { if (m && m.lastModified == null) m.lastModified = Date.now(); });
                        merged.sort((a: any, b: any) => (b.lastModified || 0) - (a.lastModified || 0));
                        await plugin.writeRemote(store, merged);
                        console.log(`📤 ${toRemote.length} items written to remote store "${store}"`);
                        anyChanges = true;
                    }
                } catch (err) {
                    console.error(`❌ Sync failed for store "${store}" with ${plugin.label}`, err);
                }
            }
        }
        // Generic per-plugin manifest update hook
        if (plugins.some(p => p.updateManifest)) {
            try {
                const dbStores = await dbService.getObjectStoresNames();
                const summary: Array<{ name: string; itemCount: number; lastModified: number; contentHash: string }> = [];
                for (const store of dbStores) {
                    let items = await dbService.exportDB(store).catch(() => []);
                    // Exclude internal manifest summary record from hashing & counts
                    if (store === 'settings') {
                        items = items.filter((it: any) => it?.key !== 'lastStorageManifestSummary');
                    }
                    const keyFn = (it: any) => it?.key || it?.id || it?.activityId || '';
                    const str = stableStoreString(items, keyFn);
                    const hash = await sha256Hex(str);
                    let lastModified = 0;
                    items.forEach((i: any) => { if (i && i.lastModified && i.lastModified > lastModified) lastModified = i.lastModified; });
                    summary.push({ name: store, itemCount: items.length, lastModified, contentHash: `sha256:${hash}` });
                }
                const aggregate = await sha256Hex(JSON.stringify(summary.map(s => s.contentHash).sort()));
                const aggregateHash = `sha256:${aggregate}`;
                // Check previous snapshot to avoid constant churn
                let previousAggregate: string | null = null;
                try {
                    const prev = await dbService.getData('lastStorageManifestSummary');
                    previousAggregate = prev?.aggregateHash || null;
                } catch { /* ignore */ }

                if (previousAggregate !== aggregateHash) {
                    try {
                        await dbService.saveData('lastStorageManifestSummary', {
                            stores: summary,
                            aggregateHash,
                            savedAt: Date.now()
                        });
                    } catch (e) {
                        console.warn('[StorageService] Failed to persist local manifest summary', e);
                    }
                    await Promise.all(plugins.filter(p => p.updateManifest).map(p => p.updateManifest!(summary, aggregateHash)));
                } else {
                    // No change, skip manifest update
                }
            } catch (err) {
                console.warn('[StorageService] Manifest hook failed', err);
            }
        }
        return anyChanges;
    }

    /**
     * Import one-way FROM remote to local for given stores (or all) without pushing local changes.
     * Use after authentication to hydrate a fresh IndexedDB.
     */
    public async importFromRemote(stores?: string[]): Promise<void> {
        try {
            const plugins = await this.pluginManager.getMyStoragePlugins();
            if (!plugins.length) {
                console.log('[StorageService] importFromRemote: no storage plugins enabled');
                return;
            }
            const db = await IndexedDBService.getInstance();
            let targetStores = stores && stores.length ? stores : await db.getObjectStoresNames();
            targetStores = targetStores.filter(s => ['activities','activity_details','settings','notifLogs'].includes(s));
            const keyFn = (item: any) => item.key || item.id || item.activityId || (item as any).activityIdSeconds || JSON.stringify(item);
            // Suppress backup triggers during hydration window
            this.suppressBackupsUntil = Date.now() + 1500;
            for (const plugin of plugins) {
                console.log(`⬇️  Import from remote (${plugin.label}) for stores: ${targetStores.join(', ')}`);
                // Plugin-specific optimization hook
                if (plugin.optimizeImport) {
                    try { targetStores = await plugin.optimizeImport(targetStores); } catch { /* ignore */ }
                }
                for (const store of targetStores) {
                    try {
                        const [localData, remoteData] = await Promise.all([
                            db.exportDB(store).catch(() => [] as any[]),
                            plugin.readRemote(store).catch(() => [] as any[])
                        ]);
                        if (!Array.isArray(remoteData) || remoteData.length === 0) continue;
                        const localMap = new Map<any, any>(localData.map((i: any) => [keyFn(i), i]));
                        const toPut: any[] = [];
                        const now = Date.now();
                        for (const r of remoteData) {
                            const k = keyFn(r);
                            const existing = localMap.get(k);
                            if (!existing || JSON.stringify(existing) !== JSON.stringify(r)) {
                                if (r && typeof r === 'object' && (r as any).lastModified == null) (r as any).lastModified = now;
                                toPut.push(r);
                            }
                        }
                        console.log(`[StorageService][import] store="${store}" remote=${remoteData.length} local=${localData.length} toPut=${toPut.length}`);
                        if (toPut.length) {
                            await db.addItemsToStore(store, toPut, keyFn);
                            console.log(`📥 Imported ${toPut.length} remote items into local store "${store}"`);
                        }
                    } catch (err) {
                        console.warn(`⚠️ importFromRemote failed for store ${store} with plugin ${plugin.id}`, err);
                    }
                }
            }
            // allow some delay before re-enabling backups to let events flush
            setTimeout(() => { this.suppressBackupsUntil = 0; }, 1600);
        } catch (e) {
            console.error('[StorageService] importFromRemote global failure', e);
        }
    }
}
