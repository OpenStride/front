import { DataProviderPluginManager } from '@/services/DataProviderPluginManager';
import type { ProviderPlugin } from '@/types/provider';

export class DataProviderService {
    private static instance: DataProviderService;
    private pluginManager = DataProviderPluginManager.getInstance();
    public emitter = new EventTarget();

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

                    // Emit event after successful refresh
                    this.emitter.dispatchEvent(
                        new CustomEvent('provider-activities-imported', {
                            detail: {
                                providerId: plugin.id,
                                providerLabel: plugin.label,
                                timestamp: Date.now()
                            }
                        })
                    );
                } else {
                    console.warn(`⚠️ Plugin ${plugin.label} does not implement refreshData.`);
                }
            } catch (error) {
                console.error(`❌ DataProvider failed for plugin ${plugin.label}:`, error);
            }
        }
    }
}