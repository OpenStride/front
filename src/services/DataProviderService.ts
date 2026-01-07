import { DataProviderPluginManager } from '@/services/DataProviderPluginManager';
import type { ProviderPlugin } from '@/types/provider';

export class DataProviderService {
    private static instance: DataProviderService;
    private pluginManager = DataProviderPluginManager.getInstance();
    private constructor() { }

    public static getInstance(): DataProviderService {
        if (!DataProviderService.instance) {
            DataProviderService.instance = new DataProviderService();
        }
        return DataProviderService.instance;
    }

    public async triggerRefresh(): Promise<void> {
        const plugins: ProviderPlugin[] = await this.pluginManager.getMyDataProviderPlugins();
        for (const plugin of plugins) {
            try {
                if (plugin.refreshData) {
                    await plugin.refreshData();
                } else {
                    console.warn(`⚠️ Plugin ${plugin.label} does not implement refreshData.`);
                }
            } catch (error) {
                console.error(`❌ DataProvider failed for plugin ${plugin.label}:`, error);
            }
        }
    }
}