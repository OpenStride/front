//gere les plugins associés à l'utilisateur

// services/BackupPluginManager.ts
import { allStoragePlugins } from '@/services/StoragePluginRegistry';
import { IndexedDBService } from '@/services/IndexedDBService';
import type { StoragePlugin } from '@/types/storage';

export class StoragePluginManager {
    private static instance: StoragePluginManager;
    private constructor() { }

    public static getInstance(): StoragePluginManager {
        if (!StoragePluginManager.instance) {
            StoragePluginManager.instance = new StoragePluginManager();
        }
        return StoragePluginManager.instance;
    }

    public async enablePlugin(pluginId: string): Promise<void> {
        const db = await IndexedDBService.getInstance();
        const enabledIds = await this.getEnabledPluginIds();
        if (!enabledIds.includes(pluginId)) {
            enabledIds.push(pluginId);
            await db.saveData('enabledStoragePlugins', enabledIds);
        }
    }

    /**  
     * Récupère la liste des plugin IDs activés par l’utilisateur  
     * stockés dans ta table "settings" (ou équivalent).  
     */
    private async getEnabledPluginIds(): Promise<string[]> {
        const db = await IndexedDBService.getInstance();
        const ids = await db.getData('enabledStoragePlugins');
        return Array.isArray(ids) ? ids : [];
    }

    /**
     * Renvoie les plugins installés **et** activés/configurés
     */
    public async getMyStoragePlugins(): Promise<StoragePlugin[]> {
        const enabledIds = await this.getEnabledPluginIds();
        return allStoragePlugins.filter(p => enabledIds.includes(p.id));
    }
}
