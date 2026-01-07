//gere les plugins associés à l'utilisateur

// services/DataProviderPluginManager.ts
import { allProviderPlugins } from '@/services/ProviderPluginRegistry';
import { IndexedDBService } from '@/services/IndexedDBService';
import type { ProviderPlugin } from '@/types/provider';

export class DataProviderPluginManager {
    private static instance: DataProviderPluginManager;
    private constructor() { }

    public static getInstance(): DataProviderPluginManager {
        if (!DataProviderPluginManager.instance) {
            DataProviderPluginManager.instance = new DataProviderPluginManager();
        }
        return DataProviderPluginManager.instance;
    }

    public async enablePlugin(pluginId: string): Promise<void> {
        const db = await IndexedDBService.getInstance();
        const enabledIds = await this.getEnabledPluginIds();
        if (!enabledIds.includes(pluginId)) {
            enabledIds.push(pluginId);
            await db.saveData('enabledDataProviderPlugins', enabledIds);
        }
    }

    /**  
     * Récupère la liste des plugin IDs activés par l’utilisateur  
     * stockés dans ta table "settings" (ou équivalent).  
     */
    private async getEnabledPluginIds(): Promise<string[]> {
        const db = await IndexedDBService.getInstance();
        const ids = await db.getData('enabledDataProviderPlugins');
        return Array.isArray(ids) ? ids : [];
    }

    /**
     * Renvoie les plugins installés **et** activés/configurés
     */
    public async getMyDataProviderPlugins(): Promise<ProviderPlugin[]> {
        const enabledIds = await this.getEnabledPluginIds();
        return allProviderPlugins.filter(p => enabledIds.includes(p.id));
    }
}
